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

const smsStart = 'SMS Message: ';


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

	return findUserById(data.user.id).then(user =>
	{
		if (!user.phone) err.throwE('User has no phone', user);

		const currentMsg = data.conversation_parts.conversation_parts[0];
		const message = htmlToText.fromString(currentMsg.body);
		return {
			to: user.phone,
			body: message.replace(smsStart, "")
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
	return findOrCreateUserByPhone(phone).then(theUser =>
	{
		user = theUser;

		return findActiveConvo(user.id);
	}).then(activeConvo =>
	{
		if (!activeConvo) return createUserMessage(user.id, data.body);
		else return readConvo(activeConvo.id).then(() =>
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
	}).then(user =>
	{
		if (!user) err.throwE('No user found with id', intercomId);

		return user.body;
	});
};

function findOrCreateUserByPhone(phone)
{
	return findUserByPhone(phone).catch(() =>
	{
		return findUserByPhone(phone, true);
	}).catch(() =>
	{
		return client.users.create(
		{
			phone: phone,
			user_id: Date.now()
		}).then(res =>
		{
			return res.body;
		});
	});
};

function findUserByPhone(phone, partialMatch, pages)
{
	let prom = Promise.resolve();
	if (pages) prom = client.nextPage(pages);
	else prom = client.users.list();

	return prom.then(res =>
	{
		// If there are no more results then exit with an error
		if (!res.body.users.length)
		{
			if (partialMatch) return partialMatch;
			err.throwE('No user found with phone', phone);
		}

		// Try to find the user by phone in this list
		const anonymousMatch = res.body.users.find(u =>
		{
			return !u.email && formatPhone(u.phone) === phone;
		});
		const perfectMatch = res.body.users.find(u =>
		{
			return !!u.email && formatPhone(u.phone) === phone;
		});

		// If user was found, return it
		if (perfectMatch) return perfectMatch;

		if (!res.body.pages.next)
		{
			if (partialMatch) return partialMatch;
			if (anonymousMatch) return anonymousMatch;
			err.throwE('No user found with phone', phone);
		}

		// If user wasn't found, scroll to next page
		return findUserByPhone(phone, anonymousMatch, res.body.pages);
	});
};

function findActiveConvo(userId)
{
	return client.conversations.list(
	{
		sort: 'updated_at',
		intercom_user_id: userId
	}).then(res =>
	{
		if (!res.body.conversations) return;

		return res.body.conversations.find(c =>
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
	}).then(res =>
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
	}).then(res =>
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
	// Ignored closed convos
	if (!convo.open) return false;

	// Ignore convos where the latest message is empty
	if (!convo.conversation_message.body) return false;
	if (!convo.conversation_message.body.length) return false;

	// Parse out body from text to html
	const body = htmlToText.fromString(convo.conversation_message.body);
	if (!body) return false;

	// Return true if beginning of body matches prefix
	if (body.substring(0, smsStart.length) === smsStart) return true;

	// Otherwise start looking for any past messages which had the sms msg: flag in them

	// If there are none, exit
	if (!convo.conversation_parts) return false;
	const msgs = convo.conversation_parts.conversation_parts;
	if (!msgs || !msgs.length) return false;

	// Return true if you find at least 1 past msg meant for SMS
	return !!msgs.find(msg =>
	{
		const body = htmlToText.fromString(msg.body);
		return body && body.substring(0, smsStart.length) === smsStart;
	});
}

function formatPhone(number)
{
	if (!number) return;

	const phoneUtil = phoneParser.PhoneNumberUtil.getInstance();
	const parsedNumber = phoneUtil.parse(number, 'US');

	return phoneUtil.format(parsedNumber, phoneParser.PhoneNumberFormat.NATIONAL);
}