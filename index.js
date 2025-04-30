import express from 'express';
import session from 'express-session';
import { open } from "sqlite";
import sqlite3 from 'sqlite3'
import bcrypt from 'bcrypt'

// BRUKERNAVN OG PASSORD TIL ADMIN-BRUKER: 
// admin@test.no
// 123456

// Opnar databasen database.db
const dbPromise = open({
    filename: 'database.db',
    driver: sqlite3.Database
});

const app = express();
const port = 3000;

app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));


// Startar ein express applikasjon, og gjer den port 3000 
app.listen(port, () => {
    console.log(`Serveren har startet her: http://localhost:${port}`);
});

// Henter fila index.ejs 
app.get('/', (req, res) => {
    res.render('index');
});

// Henter fila login.ejs
app.get("/login", async (req, res) => {
    res.render("login");
})

// Vert kjørt når brukaren klikker "Registrer deg"
// Denne ligg i action på <form> 

app.post("/register", async (req, res) => {
    const db = await dbPromise;
    const { fname, lname, email, password, confirmPassword } = req.body;

    if (password != confirmPassword) {
        res.render("register", { error: "Password must match." })
        return;
    }
    const passwordHash = await bcrypt.hash(confirmPassword, 10);

    // Tabellen eg bruker heiter "users" og har kolonnene "firstname", "lastname", "email" og "password"
    await db.run("INSERT INTO users (firstname, lastname, email, password) VALUES (?, ?, ?, ?)", fname, lname, email, passwordHash);
    res.redirect("/login");

})

// Denne vert kjørt når brukaren trykker "Logg inn", i fila login.ejs
// Ref: <form action="/auth" method="post"> 
// Denne sjekker om brukaren finnes i databasen, og om passord dei skriv inn er rett.

app.post('/auth', async function (req, res) {

    const db = await dbPromise;
    const { email, password } = req.body;
    let getUserDetails = `SELECT * FROM users WHERE email = '${email}'`;
    let checkInDb = await db.get(getUserDetails);

    if (checkInDb === undefined) {
        res.status(400);
        res.send("Invalid user");
    } else {
        const isPasswordMatched = await bcrypt.compare(
            password,
            checkInDb.password
        );

        if (isPasswordMatched) {
            res.status(200);
            if (checkInDb.role == 1) { // Sjekker om brukaren er admin. Admin = 1
                req.session.admin = true;

            }
            // Dersom brukaren finnes, logg inn
            req.session.loggedin = true;
            req.session.email = email;
            req.session.userid = checkInDb.id;
            // Redirect til heimesida
            res.redirect('/home');
        } else {
            res.status(400);
            res.send("Invalid password");
            res.redirect("/");
        }

    }

});

app.get("/home", async (req, res) => {
    const db = await dbPromise;
    const admin = req.session.admin;
    const userid = req.session.userid;

    // Hent kun spel som brukaren har lagt inn
    const games = await db.all("SELECT * FROM my_games WHERE user_id = ? ORDER BY rating DESC", userid);

    res.render("home", { admin, games });
});

app.get("/logout", async (req, res) => {

    req.session.loggedin = false;
    req.session.username = '';
    req.session.admin = false; // ADMIN SYSTEM
    res.redirect("/")
})

// ADMIN SYSTEM
app.get('/profile', async function (req, res) {
    if (req.session.loggedin) {
        const userid = req.session.userid;
        const admin = req.session.admin;
        const db = await dbPromise;
        let getUserDetails = `SELECT * FROM users WHERE id = '${userid}'`;
        let user = await db.get(getUserDetails);

        if (user === undefined) {
            res.status(400);
            res.send("Invalid user");
        } else {
            res.status(200);
            // Hent filmer som er favoritter for denne brukeren
            res.render('profile', { userid, user, admin });
        }
    }
    else {
        return res.render(403);
    }
});


// Rute for å håndtere POST-forespørsler til '/admin/delete/:id'.
app.post('/profile/delete/:id', async (req, res) => {
    const id = req.params.id;  // Henter ID fra URL-parameteren.
    const db = await dbPromise; // Venter på at databasetilkoblingen skal være klar.
    const query = 'DELETE FROM users WHERE id = ?';

    try {
        await db.run(query, id); // Utfører sletting av brukeren fra databasen.
        console.log('Deleted user with ID:', id); // Logger ID-en til brukeren som ble slettet.
        res.redirect('/');  // Omdirigerer tilbake til admin-siden etter sletting.
    } catch (error) {
        console.error('Error when deleting:', error); // Logger eventuelle feil under sletting.
        res.status(500).send("Unable to delete user.");  // Sender feilmelding hvis sletting feiler.
    }
});


// Bruker kan redigere sin egen profil
app.get('/profile/edit', async function (req, res) {
    const admin = req.session.admin;
    const db = await dbPromise;
    const loggedInUserId = req.session.userid; // Henter ID-en til den innloggede brukeren


    // Sørger for at en vanlig bruker kun kan redigere sin egen profil
    if (!loggedInUserId) {
        return res.status(403).send("Du har ikkje tilgang til å redigere denne profilen.");
    }

    const query = "SELECT * FROM users WHERE id = ?";
    const user = await db.get(query, loggedInUserId);

    if (!user) {
        return res.status(404).send("Bruker ikkje funnet.");
    }

    res.render('edit', { user, admin });
});

app.post('/profile/edit/:id', async function (req, res) {
    const id = req.params.id;  // Henter ID fra URL-parameteren.

    // Sjekker om brukaren er logga inn, hvis ikkje - vart den sendt til fila 403.ejs i mappa errors
    if (!req.session.loggedin) {
        return res.render(403);
    }

    const db = await dbPromise;
    const loggedInUserId = req.session.userid; // finner userid til innlogga brukar
    const admin = req.session.admin; // finner ut om brukaren som er logga inn er admin

    // Sjekker om brukaren som prøver å redigere profilen, er den same som er logga inn, eller om admin
    if (parseInt(id) !== loggedInUserId) {
        return res.render(403);
    }

    // henter ut firstname og lastname frå <form> i edit.ejs 
    // desse er "name" i <input> feltet, og må skrives på same måte 
    const { firstname, lastname } = req.body; 

    const query = "UPDATE users SET firstname = ?, lastname = ? WHERE id = ?";

    try {
        await db.run(query, [firstname, lastname, loggedInUserId]); // kjører SQL spørringen
        //console.log(`Profil oppdatert for bruker-ID: ${loggedInUserId}`);
        res.redirect('/profile'); // Tilbake til profilsiden
    } catch (error) {
        //console.error('Feil ved oppdatering:', error);
        res.status(500).send("Kunne ikkje oppdatere profilen.");
    }
});

// ADMIN SYSTEM - opner admin.ejs
app.get('/admin', async function (req, res) {
    if (req.session.loggedin) {
        const user = req.session.email;
        const db = await dbPromise;
        let getUserDetails = `SELECT * FROM users WHERE email = '${user}' AND role = 1`;
        let checkInDb = await db.get(getUserDetails);
        const query = 'SELECT * FROM users';
        const users = await db.all(query); // kjører SQL spørringen

        if (checkInDb === undefined) {
            res.status(400);
            res.send("Invalid user");
        } else {
            let admin = true;
            res.status(200);
            res.render('admin', { user, admin, users });
        }
    }
});


// Rute for å håndtere POST-forespørsler til '/admin/delete/:id'.
app.post('/admin/delete/:id', async (req, res) => {
    const id = req.params.id;  // Henter ID fra URL-parameteren.
    const db = await dbPromise; // Venter på at databasetilkoblingen skal være klar.
    const query = 'DELETE FROM users WHERE id = ?';

    try {
        await db.run(query, id); // Utfører sletting av brukeren fra databasen.
        //console.log('Deleted user with ID:', id); // Logger ID-en til brukeren som ble slettet.
        res.redirect('/admin');  // Omdirigerer tilbake til admin-siden etter sletting.
    } catch (error) {
        //console.error('Error when deleting:', error); // Logger eventuelle feil under sletting.
        res.status(500).send("Unable to delete user.");  // Sender feilmelding hvis sletting feiler.
    }
});

app.get("/admin/edit/:id", async (req, res) => {
    const admin = req.session.admin;
    if (!req.session.admin) {
        return res.redirect("/home"); // Sikrer at kun admin har tilgang
    }

    const db = await dbPromise;
    const userId = req.params.id; // Henter brukerens ID fra URL
    const user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);

    if (!user) {
        return res.status(404).send("Bruker ikkje funnet");
    }

    res.render("admin_edit", { user, admin });
});

app.post("/admin/edit/:id", async (req, res) => {
    const admin = req.session.admin;
    if (!admin) {
        return res.status(403).send("Access Denied");
    }

    const db = await dbPromise;
    const { firstname, lastname, role } = req.body;
    const userId = req.params.id;

    try {
        await db.run(
            "UPDATE users SET firstname = ?, lastname = ?, role = ? WHERE id = ?",
            [firstname, lastname, role, userId]
        );

        // 👇 Sjekk om admin redigerte seg selv:
        if (parseInt(userId) === req.session.userid) {
            // 👇 Oppdater admin-status i sesjonen:
            req.session.admin = parseInt(role) === 1;
        }

        res.redirect("/admin");
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send("Error updating user.");
    }
});

app.get('/add-game', (req, res) => {
    const admin = req.session.admin;

    if(!req.session.loggedin) {
      return res.status(403).send("Du må være logget inn for å legge til spel.");
    }

    res.render('add-game', { admin });
});


app.post('/add-game', async (req, res) => {
    
    //sjekker om brukaren er logga inn
    if (!req.session.loggedin) {
        return res.status(403).send("Du må være logget inn for å legge til spel.");
    }

    const { tittel, årstall, rating, sjanger, image_url } = req.body;
    const userid = req.session.userid; // Lagrer userid til pålogga i ein variabel
    const db = await dbPromise; // Lagrer eit database-objekt
    try {
        await db.run( // Venter på at databasen skal bli ferdig med denne koden før den går vidare
            "INSERT INTO my_games (tittel, årstall, rating, sjanger, image_url, user_id) VALUES (?, ?, ?, ?, ?, ?)",
            tittel, årstall, rating, sjanger, image_url, userid // Desse variablane er verdien til det som står i input-feltene i .ejs
        );
        res.redirect('/home'); // Når den er ferdig, blir brukaren sendt til heimesida
    } catch (err) { // Feilhåndtering dersom det ikkje går å oppdatere databasen
        console.error(err);
        res.status(500).send("Kunne ikkje legge til spel.");
    }
});

app.get('/edit-game/:id', async (req, res) => {
    const db = await dbPromise;
    const gameId = req.params.id;
    const userid = req.session.userid;
    const admin = req.session.admin;

    const game = await db.get("SELECT * FROM my_games WHERE id = ? AND user_id = ?", [gameId, userid]);

    if (!game) {
        return res.status(403).send("Du har ikkje tilgang til å redigere dette spelet.");
    }

    res.render('edit-game', { game, admin });
});

app.post('/edit-game/:id', async (req, res) => {
    const db = await dbPromise;
    const gameId = req.params.id;
    const userid = req.session.userid;

    const { tittel, årstall, rating, sjanger, image_url } = req.body;

    const game = await db.get("SELECT * FROM my_games WHERE id = ? AND user_id = ?", [gameId, userid]);

    if (!game) {
        return res.status(403).send("Du har ikkje tilgang til å redigere dette spelet.");
    }

    await db.run(
        "UPDATE my_games SET tittel = ?, årstall = ?, rating = ?, sjanger = ?, image_url = ? WHERE id = ?",
        [tittel, årstall, rating, sjanger, image_url, gameId]
    );

    res.redirect('/home');
});


app.post('/delete-game/:id', async (req, res) => {
    const db = await dbPromise;
    const gameId = req.params.id;
    const userid = req.session.userid;

    // Hent spillet og sjekk om det tilhører brukeren
    const game = await db.get("SELECT * FROM my_games WHERE id = ? AND user_id = ?", [gameId, userid]);

    if (!game) {
        return res.status(403).send("Du har ikkje tilgang til å slette dette spelet.");
    }

    await db.run("DELETE FROM my_games WHERE id = ?", [gameId]);

    res.redirect('/home');
});
