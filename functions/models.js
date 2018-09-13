

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

class StepLog {
    constructor(date, steps, description, goal) {
        this.date = date;
        this.steps = steps;
        this.description = description;
        this.goal = goal;
    }
}