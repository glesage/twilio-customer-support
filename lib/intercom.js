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

const smsStart = 'SMS Message\n\n';


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

module.exports.send = function (data)
{
	if (!data) return err.rejectE('No data received');
	if (!data.phone) return err.rejectE('No phone received');
	if (!data.body) return err.rejectE('No intercom body received');

	let user;
	const phone = formatPhone(data.phone);
	return findOrCreateUserByPhone(phone).then(function (theUser)
	{
		user = theUser;

		return findActiveConvo(user.id);
	}).then(function (activeConvo)
	{
		if (!activeConvo) return createUserMessage(user.id, data.body);
		else return readConvo(activeConvo.id).then(function ()
		{
			return respondToConvo(user.id, activeConvo.id, data.body);
		});
	});
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

function findOrCreateUserByPhone(phone)
{
	return findUserByPhone(phone).catch(function ()
	{
		return findUserByPhone(phone, true);
	}).catch(function ()
	{
		return client.users.create(
		{
			phone: phone,
			user_id: Date.now()
		}).then(function (res)
		{
			return res.body;
		});
	});
};

function findUserByPhone(phone, tempUser, pages)
{
	let prom = Promise.resolve();
	if (pages) prom = client.nextPage(pages);
	else prom = client.users.list();

	return prom.then(function (res)
	{
		// If there are no more results then exit with an error
		if (!res.body.users.length)
		{
			err.throwE('No user found with phone', phone);
		}

		// Try to find the user by phone in this list
		const user = res.body.users.find(function (u)
		{
			// If you're looking for real users but this one has no email, exit
			// since they aren't a real user
			if (!tempUser && !u.email) return false;

			return formatPhone(u.phone) === phone;
		});

		// If user was found, return it
		if (user) return user;

		if (!res.body.pages.next)
		{
			err.throwE('No user found with phone', phone);
		}

		// If user wasn't found, scroll to next page
		return findUserByPhone(phone, tempUser, res.body.pages);
	});
};

function findActiveConvo(userId)
{
	return client.conversations.list(
	{
		sort: 'updated_at',
		intercom_user_id: userId
	}).then(function (res)
	{
		if (!res.body.conversations) return;

		return res.body.conversations.find(function (c)
		{
			return c.user.id === userId && isSMSConvo(c);
		});
	});
}

function createUserMessage(userId, body)
{
	return client.messages.create(
	{
		from:
		{
			type: "user",
			id: userId
		},
		body: smsStart + body
	}).then(function (res)
	{
		return res.body;
	});
}

function respondToConvo(userId, convoId, body)
{
	return client.conversations.reply(
	{
		id: convoId,
		type: 'user',
		intercom_user_id: userId,
		body: htmlToText.fromString(body),
		message_type: 'comment'
	}).then(function (res)
	{
		return res.body;
	});
}

function readConvo(convoId)
{
	return client.conversations.markAsRead(
	{
		id: convoId
	});
}

function isSMSConvo(convo)
{
	if (!convo.open) return false;

	if (!convo.conversation_message.body) return false;
	if (!convo.conversation_message.body.length) return false;

	var body = htmlToText.fromString(convo.conversation_message.body);
	if (!body) return false;

	return body.substring(0, smsStart.length) === smsStart;
}

function formatPhone(number)
{
	if (!number) return;

	const phoneUtil = phoneParser.PhoneNumberUtil.getInstance();
	const parsedNumber = phoneUtil.parse(number, 'US');

	return phoneUtil.format(parsedNumber, phoneParser.PhoneNumberFormat.NATIONAL);
}