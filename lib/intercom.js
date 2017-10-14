/**
 * Env var checks
 */
if (!process.env.INTERCOM_TOKEN) throw new Error('INTERCOM_TOKEN env var required');


/**
 * Dependencies
 */
const Intercom = require('intercom-client');
const phoneParser = require('node-phonenumber');
const htmlToText = require('html-to-text');
const err = require('./logger.js');

const client = new Intercom.Client(
{
	token: process.env.INTERCOM_TOKEN
});


/**
 * Exports
 */
module.exports.receive = function (body)
{
	if (!body || !body.data || !body.data.item)
	{
		return err.rejectE('Invalid body', body);
	}

	const data = body.data.item;

	if (!data.user)
	{
		return err.rejectE('No user provided', data);
	}
	if (!data.conversation_parts || !data.conversation_parts.conversation_parts)
	{
		return err.rejectE('No conversation_parts provided', data);
	}
	if (!data.conversation_parts.conversation_parts.length)
	{
		return err.rejectE('No conversation_parts message', data);
	}

	if (!isSMSConvo(data)) return Promise.resolve();

	return findUserById(data.user.id).then(function (user)
	{
		if (!user.phone) err.throwE('User has no phone', user);

		const currentMsg = data.conversation_parts.conversation_parts[0];
		var message = htmlToText.fromString(currentMsg.body);
		return {
			to: user.phone,
			body: message
		};
	});
};

module.exports.send = function (phone, body)
{
	return Promise.resolve();
}

/**
 * Utilities
 */
function findUserById(intercomId)
{
	return client.users.find(
	{
		id: intercomId
	}).then(function (user)
	{
		if (!user) err.throwE('No user found with id', intercomId);

		return user.body;
	});
};

function isSMSConvo(convo)
{
	if (!convo.open) return false;

	if (!convo.conversation_message.body) return false;
	if (!convo.conversation_message.body.length) return false;

	var body = htmlToText.fromString(convo.conversation_message.body);
	if (!body) return false;

	return body.substring(0, 4).toLowerCase() === 'sms:';
}

function formatPhone(number)
{
	if (!number) return;

	const phoneUtil = phoneParser.PhoneNumberUtil.getInstance();
	const parsedNumber = phoneUtil.parse(number, 'US');

	return phoneUtil.format(parsedNumber, phoneParser.PhoneNumberFormat.NATIONAL);
}