/* Dependencies */
const express = require('express');
const bodyParser = require('body-parser');

const sms = require('./lib/sms.js');
const intercom = require('./lib/intercom.js');

const app = express();
app.use(bodyParser());

function respond200(req, res, next)
{
    res.sendStatus(200);
}

function respondTwilio(req, res, next)
{
    res.status(200).send('<Response></Response>');
}

app.post('/sms', (req, res) =>
{
    sms.receive(req.body).then(res =>
    {
        if (res) return intercom.send(res);
    }).catch(err =>
    {
        console.error('SMS error: ' + JSON.stringify(err));
    });

    respondTwilio(req, res);
});

app.post('/intercom', (req, res) =>
{
    intercom.receive(req.body).then(res =>
    {
        if (res) return sms.send(res);
    }).catch(err =>
    {
        console.error('Intercom error: ' + JSON.stringify(err));
    });

    respond200(req, res);
});

app.use('/', respond200);

app.listen(80, () =>
{
    console.info(`Listening on port 80`);
});