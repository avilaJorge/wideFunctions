/**
 * API for managing users
 * This API is currently not being used and may not be used at all.  The app is currently sending
 * this information directly to the database.  May keep things this way since there is not point
 * in indirectly storing the data.
 */
'use strict';

class User {
    constructor(googleUID, userName, photoURL, email, authExpires, groupName) {
        this.googleUID = googleUID;
        this.userName = userName;
        this.photoURL = photoURL;
        this.email = email;
        this.authExpires = authExpires;
        this.groupName = groupName;
        this.isMeetupAuthenticated = false;
        this.meetupAuthToken = '';
        this.isUAAuthenticated = false;
        this.underArmourAuthToken = '';
    }
}

const createUser = (req, res, next) => {
    console.log(req.body);
    const user = req.body;
    admin.database().ref('/users.js/' + user.googleUID).set(
        new User(
            user.googleUID,
            user.userName,
            user.photoURL,
            user.email,
            user.authExpires,
            user.groupName
        )
    ).then(() => {
        console.log("User " + user.userName + " was added to database!");
        res.send("User was successfully added to the database!");
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const postStepLog = (req, res, next) => {
    const log = new StepLog(
        req.body.date,
        req.body.steps,
        req.body.description,
        req.body.goal
    );
    admin.database().ref('/step-logs/' + req.params.uid + '/' + req.params.date).set(log)
        .then(() => {
            console.log("User " + req.user.name + " now has a log posted for " + req.body.date);
            return;
        }).catch((error) => {
        console.log(error);
    });
};

const getUser = (req, res, next) => {
    admin.database().ref('/users.js').child(req.params.uid).once('value').then((dataSnapShot) => {
        const user = dataSnapShot.val();
        res.send(user);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getLogEntry = (req, res, next) => {
    admin.database().ref('/step-logs/' + req.params.uid + '/' + req.params.date).once('value').then((dataSnapShot) => {
        const log = dataSnapShot.val();
        res.send(log);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getUserLogEntries = (req, res, next) => {
    admin.database().ref('/step-logs/' + req.params.uid).once('value').then((dataSnapShot) => {
        const logs = dataSnapShot.val();
        res.send(logs);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getAllLogEntries = (req, res, next) => {
    admin.database().ref('/step-logs/').once('value').then((dataSnapShot) => {
        const logs = dataSnapShot.val();
        res.send(logs);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

const getUsersInGroup = (req, res, next) => {
    admin.database().ref('users').once('value').then((dataSnapShot) => {
        const users = {};
        console.log(dataSnapShot.numChildren());
        dataSnapShot.forEach((child) => {
            if (child.val().groupName === req.params.group) {
                users[child.key] = child.val();
            }
        });
        res.send(users);
        return;
    }).catch((error) => {
        console.log(error);
    });
};

// Create a user
app.post('/auth/user', createUser);
// Get User
app.get('/auth/user/:uid', getUser);
// Get Users in Group
app.get('/auth/users.js/:group', getUsersInGroup);
// Create a log entry
app.post('/log/:uid/:date', postStepLog);
// Update a log entry
app.put('/log/:uid/:date', postStepLog);
// Get a log entry
app.get('/log/:uid/:date', getLogEntry);
// Get all log entries for user
app.get('/log/:uid', getUserLogEntries);
// Get all log entries
app.get('/log', getAllLogEntries);