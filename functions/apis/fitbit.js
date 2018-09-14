/**
 * functions for interacting with the Fitbit API
 */
'use strict';

const {functions, firestore} = require('../firebase-imports');
const request = require('request');
const rp = require('request-promise-native');

const client_id = "22CZGM";
const client_secret = "5604c5b55933fad4146c877ce6ff8224";

// const fitbit_integration_redirect_uri = '&redirect_uri=https://us-central1-wide-app.cloudfunctions.net/app/auth/fitbit';
const fitbit_integration_redirect_uri = 'http://localhost:5000/wide-app/us-central1/app/auth/fitbit';
const access_token_endpoint = 'https://api.fitbit.com/oauth2/token';
const fitbit_api_base_uri  = 'https://api.fitbit.com';

exports.integrateFitbit = (req, res, next) => {
    console.log(req.query);
    console.log(req.headers);
    const userId = req.query.state;
    res.send(`<h4>Please close this browser window now.</h4>`);
    if (!req.query.error) {
        const reqOpts = {
            uri: access_token_endpoint,
            form: {
                code: req.query.code,
                client_id: client_id, //functions.config().fitbit-config.client_id,
                grant_type: 'authorization_code',
                redirect_uri: fitbit_integration_redirect_uri,
                state: userId,
            },
            method: 'POST',
            headers: {
                'Content-Type': 'Content-Type: application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + new Buffer(client_id + ':' + client_secret).toString('base64')
                // 'Authorization': 'Basic ' + new Buffer(functions.config().fitbit-config.client_id +
                //     ':' + functions.config().fitbit-config.client_secret).toString('base64')
            }
        };
        const userDoc = firestore.doc(`users/${userId}`);

        rp(reqOpts).then((response) => {
            const fitbit_grant = JSON.parse(response);
            return userDoc.set({
                isFitbitAuthenticated: true,
                fitbit_token_expires: (fitbit_grant.expires_in*1000) + Date.now(),
                fitbit_access_data: fitbit_grant},
                {merge: true});
        }).then((writeResult) => {
            console.log('Data was stored in Firestore');
            console.log(writeResult);
            return;
        }).catch((error) => {
            throw error;
        });
    }
};

exports.getSteps = (req, res, next) => {
    console.log(req.query);
    console.log(req.headers);
    const uri = fitbit_api_base_uri + '/1/user/-/activities/steps/date/'
        + req.params.date + '/' + req.query.period + '.json';
    const opts = {
        uri: uri,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': req.query.authorization
        }
    };
    rp(opts).then((response) => {
        console.log(response);
        res.send(response);
        return;
    }).catch((err) => {
        console.log('There was an error getting the fitbit data');
        let error_response = JSON.parse(err.response.body);
        console.log(error_response);
        res.status(403).send({error: error_response});
        throw err;
    });
};

exports.checkAccessToken = (req, res, next) => {
    console.log(req.query);
    console.log(req.headers);
    console.log(req.params);
    let userId = req.query.uid;
    let expiration_date = parseInt(req.query.token_expires, 10);
    req.query.new_access_token = false;
    console.log('Checking if the Fitbit access token is expried');
    if (Date.now() >= expiration_date) {
        console.log('Fitbit access token is expired.  Will refresh this token.');
        const reqOpts = {
            uri: access_token_endpoint,
            form: {
                grant_type: 'refresh_token',
                refresh_token: req.query.refresh_token,
            },
            method: 'POST',
            headers: {
                'Content-Type': 'Content-Type: application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + new Buffer(client_id + ':' + client_secret).toString('base64')
                // 'Authorization': 'Basic ' + new Buffer(functions.config().fitbit-config.client_id +
                //     ':' + functions.config().fitbit-config.client_secret).toString('base64')
            }
        };
        const userDoc = firestore.doc(`users/${userId}`);

        rp(reqOpts).then((response) => {
            const fitbit_grant = JSON.parse(response);
            console.log(fitbit_grant);
            req.query.authorization = 'Bearer ' + fitbit_grant.access_token;
            req.query.new_access_token = true;
            return userDoc.set({
                    isFitbitAuthenticated: true,
                    fitbit_token_expires: (fitbit_grant.expires_in*1000) + Date.now(),
                    fitbit_access_data: fitbit_grant},
                {merge: true});
        }).then((writeResult) => {
            console.log('Fitbit token successfully refreshed and data was stored in Firestore');
            console.log(writeResult);
            return next();
        }).catch((error) => {
            throw error;
        });
    } else {
        return next();
    }
    return;
};
