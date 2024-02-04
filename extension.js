const fs = require('fs')
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

async function loadSavedCredentialsIfExist() {
	try {
		const content = await fs.promises.readFile(TOKEN_PATH);
		const credentials = JSON.parse(content);
		return google.auth.fromJSON(credentials);
	} catch (err) {
		return null;
	}
}

async function saveCredentials(client) {
	const content = await fs.promises.readFile(CREDENTIALS_PATH);
	const keys = JSON.parse(content);
	const key = keys.installed || keys.web;
	const payload = JSON.stringify({
		type: 'authorized_user',
		client_id: key.client_id,
		client_secret: key.client_secret,
		refresh_token: client.credentials.refresh_token,
	});
	await fs.promises.writeFile(TOKEN_PATH, payload);
}

var playerMatches = {}

async function retrieveData(auth) {
	const sheets = google.sheets({ version: 'v4', auth });
	const res = await sheets.spreadsheets.values.get({
		spreadsheetId: '1f_DzgDYrAcBjXjxUfI1nhrGtLrBUKASaNQoIZ4rY7I0',
		range: 'Data!A1:R',
	});
	const rows = res.data.values;
	if (!rows || rows.length === 0) {
		console.log('No data found.');
		return;
	}
	rows.forEach((row) => {
		// Print columns A and E, which correspond to indices 0 and 4.
		var gamesList = []
		for (var i = 0; i < 5; i++) {
			gamesList.push({
				level: row[i],
				winnerTime: row[i + 7],
				loserTime: row[i + 13],
			})
		}
		var match = {
			ncs: row[5],
			winner: row[6],
			loser: row[12],
			games: gamesList
		}

		if (playerMatches[match.winner] == undefined) {
			playerMatches[match.winner] = []
		}
		playerMatches[match.winner].push(match)

		if (playerMatches[match.loser] == undefined) {
			playerMatches[match.loser] = []
		}
		playerMatches[match.loser].push(match)
	});
	console.log("data updated")
}

async function authorize() {
	let client = await loadSavedCredentialsIfExist();
	if (client) {
		return client;
	}
	client = await authenticate({
		scopes: SCOPES,
		keyfilePath: CREDENTIALS_PATH,
	});
	if (client.credentials) {
		await saveCredentials(client);
	}
	return client;
}

function updateSheetData() {
	authorize().then(retrieveData).catch(console.error);
}

function getTimeAsSeconds(time) {
	if (time == undefined) return 0
	var split = time.split(":")
	var hours = parseInt(split[0])
	var minutes = parseInt(split[1])
	var seconds = parseInt(split[2])
	return (hours * 60 * 60) + (minutes * 60) + seconds
}

function getSecondsAsTime(secs) {
	var hours = Math.floor(secs / 60 / 60)
	var minutes = Math.floor(secs / 60 % 60)
	var seconds = Math.floor(secs % 60)
	if (hours > 0) {
		return hours + ":" + (minutes < 10 ? "0" + minutes : minutes) + ":" + (seconds < 10 ? "0" + seconds : seconds)
	} else {
		return minutes + ":" + (seconds < 10 ? "0" + seconds : seconds)
	}
}

function getPlayerStats(player, level) {
	var matches = playerMatches[player]
	if (matches == undefined) { return }

	var accumulatedWins = 0
	var accumulatedPB = 200000000
	var accumulatedTotalTime = 0
	var accumulatedPlayCount = 0
	for (var i = 0; i < matches.length; i++) {
		var match = matches[i]
		for (var j = 0; j < match.games.length; j++) {
			var game = match.games[j]
			if (game.level !== level) continue
			var winnerSeconds = getTimeAsSeconds(game.winnerTime)
			var loserSeconds = getTimeAsSeconds(game.loserTime)
			if (match.loser == player) {
				accumulatedTotalTime += loserSeconds
				accumulatedPlayCount++
				if (loserSeconds < accumulatedPB) accumulatedPB = loserSeconds
				if (loserSeconds < winnerSeconds) {
					accumulatedWins++
				}
			}
			if (match.winner == player) {
				accumulatedTotalTime += winnerSeconds
				accumulatedPlayCount++
				if (winnerSeconds < accumulatedPB) accumulatedPB = winnerSeconds
				if (winnerSeconds < loserSeconds) {
					accumulatedWins++
				}
			}
		}
	}
	if (accumulatedPlayCount == 0) return

	return {
		wins: accumulatedWins,
		losses: accumulatedPlayCount - accumulatedWins,
		PB: accumulatedPB,
		averageTime: accumulatedTotalTime / accumulatedPlayCount
	}
}

var state = {
	playerLeft: "",
	playerRight: "",
	scoreLeft: 0,
	scoreRight: 0,
	round: "",
	bestOf: "",
	level: "",
	playerLeftWinLoss: "",
	playerLeftTourneyPB: "",
	playerLeftAverageTime: "",
	playerRightWinLoss: "",
	playerRightTourneyPB: "",
	playerRightAverageTime: "",
	caster1: "",
	caster2: "",
	caster3: ""
}
if (fs.existsSync('./OnevsOneState.json')) {
	state = JSON.parse(fs.readFileSync("./OnevsOneState.json"))
}

module.exports = nodecg => {
	function sendDataUpdate(ignoreId) {
		var leftStats = getPlayerStats(state.playerLeft, state.level)
		var rightStats = getPlayerStats(state.playerRight, state.level)
		if (leftStats !== undefined) {
			state.playerLeftWinLoss = leftStats.wins + " - " + leftStats.losses
			state.playerLeftTourneyPB = getSecondsAsTime(leftStats.PB)
			state.playerLeftAverageTime = getSecondsAsTime(leftStats.averageTime)
		} else {
			state.playerLeftWinLoss = 0 + " - " + 0
			state.playerLeftTourneyPB = "8:88"
			state.playerLeftAverageTime = "8:88"
		}
		if (rightStats !== undefined) {
			state.playerRightWinLoss = rightStats.wins + " - " + rightStats.losses
			state.playerRightTourneyPB = getSecondsAsTime(rightStats.PB)
			state.playerRightAverageTime = getSecondsAsTime(rightStats.averageTime)
		} else {
			state.playerRightWinLoss = 0 + " - " + 0
			state.playerRightTourneyPB = "8:88"
			state.playerRightAverageTime = "8:88"
		}
		state.socketId = ignoreId
		nodecg.sendMessage('OnevsOneUpdate', state)
		delete state.socketId
	}
	nodecg.listenFor('OnevsOneStateRequest', (id) => {
		sendDataUpdate(id)
	});
	nodecg.listenFor('UpdateOnevsOneData', (value) => {
		for (key in value) {
			state[key] = value[key]
		}
		sendDataUpdate(state.socketId)
		delete state.socketId
		const jsonString = JSON.stringify(state)
		fs.writeFile('./OnevsOneState.json', jsonString, err => {
			if (err) {
				console.log('Error writing file', err)
			} else {
			}
		})
	})
};

updateSheetData()
//setInterval(updateSheetData, 20000, 0);