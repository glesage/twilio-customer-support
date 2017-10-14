/**
 * Env var checks
 */
if (!process.env.TWILIO_SID) throw new Error('TWILIO_SID env var required');
if (!process.env.TWILIO_TOKEN) throw new Error('TWILIO_TOKEN env var required');
if (!process.env.TWILIO_NUMBER) throw new Error('TWILIO_NUMBER env var required');


/**
 * Dependencies
 */
const htmlToText = require('html-to-text');
const phoneParser = require('node-phonenumber');
const err = require('./logger.js');

const Twilio = require('twilio');
const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);


module.exports.receive = function (data)
{
	if (!data) return err.rejectE('No data received');
	if (!data.From) return err.rejectE('No from phone received');
	if (!data.Body) return err.rejectE('No sms body received');

	return Promise.resolve(
	{
		from: formatPhone(data.From),
		to: formatPhone(data.To),
		body: data.Body
	});
};

module.exports.send = function (data)
{
	if (!data.to) return err.rejectE('No to phone provided');
	if (!data.body) return err.rejectE('No sms body provided');

	return createSMS(process.env.TWILIO_NUMBER, data.to, data.body);
};


/**
 * Utilities
 */
function createSMS(from, to, body)
{
	return client.messages.create(
	{
		to: formatPhone(to),
		from: formatPhone(from),
		body: htmlToText.fromString(body)
	}).then(function (res)
	{
		console.log();
		console.log('sms');
		console.log(res);
		return res;
	});
}

function formatPhone(number)
{
	if (!number) return;

	const phoneUtil = phoneParser.PhoneNumberUtil.getInstance();
	const parsedNumber = phoneUtil.parse(number, 'US');

	return phoneUtil.format(parsedNumber, phoneParser.PhoneNumberFormat.NATIONAL);
}