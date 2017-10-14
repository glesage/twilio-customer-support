function err(prefix, data)
{
	if (!data) return new Error(prefix);
	return new Error(prefix + ': ' + JSON.stringify(data));
};
module.exports.err = err;

function rejectE(prefix, data)
{
	return Promise.reject(err(prefix, data));
};
module.exports.rejectE = rejectE;

function throwE(prefix, data)
{
	throw err(prefix, data);
};
module.exports.throwE = throwE;