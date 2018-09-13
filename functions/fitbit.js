/**
 * functions for interacting with the Fitbit API
 */
'use strict';

const {firestore} = require('../firebase-imports');
const request = require('request');

// const fitbit_integration_redirect_uri = '&redirect_uri=https://us-central1-wide-app.cloudfunctions.net/app/auth/fitbit';
const fitbit_integration_redirect_uri = '&redirect_uri=http://localhost:5000/wide-app/us-central1/app/auth/fitbit';

exports.integrateFitbit = (req, res, next) => {
    console.log(req.query);
    console.log(req.headers);
    res.send(`<h4>Please close this browser window now.</h4>`);
    if (!req.query.error) {
        console.log('Yeah!');
    }
}
