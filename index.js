// IRC bot framework
// https://en.wikipedia.org/wiki/List_of_Internet_Relay_Chat_commands

// TODO //

// new api, print(), commands can be multiple statements, command types
// ## hide url
// multiple servers, channels
// reply in PM
// 2d3h time
// REFACTOR
// create API - nick() etc command params ~()
// ~poker
// command piping
// special simple syntax parsed for colours {blue} or something
// ~> == ~eval
// url scraper -> status code
// truncate url
// command whitelist
// vim code input easier interface +test?
// help command
//https://www.npmjs.com/package/ms

// points stats, command use stats
// trivia stats
// profanity stats

// write colour lib that can copy the functionality of wrap but also accepts numbers, etc. slow migration to better colour managements, -1 = rainbow, -2 = bold etc
// http://www.df7cb.de/irc/pisg/pisg-month.html

// add Colourpicker/API info (write()) to nibblr commands
// track nick list

// document web API / command context
// event backend
// about -> github iframe

// rss("item", "description", 3)

process.env.TZ = 'Europe/London';

try {
    var config = require('./config.json');
}
catch (e) {
    console.log('config.json missing, see config.json.example');
    process.exit();
}

// db //

var sqlite3 = require("sqlite3");
var db = new sqlite3.Database(config.commands);
var log = new sqlite3.Database(config.logging);

module.exports = {
    db, log, config, client
}

// requires //
require('sugar-date');
var fs = require('fs');
var irc = require('irc');
var request = require('request');
var safeEval = require('safe-eval');
var loopProtect = require('./lib/loop-protect');
var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();

var webInterface = require('./web/server');
var logger = require('./modules/logging');
var context = require('./modules/context');
var hard = require('./modules/hardcommands');

// initconf //

var hide = {hide:1};
irc.Client.prototype._updateMaxLineLength = function() {this.maxLineLength = 400};

// init //

function init() {

    context.init(client);
    hard.init(client);
    logger(client);
    webInterface(client);
    schedule();
}

// schedule loop //

function schedule() {
    setInterval(() => {

        db.all('SELECT i,timestamp,user,message from events WHERE type = "remind"', (e,r) => {

            r.forEach(d => {

                if(Date.create(d.timestamp).isBefore('now')) {
                    db.run('DELETE FROM events WHERE i = ?', d.i);
                    client.say(config.channel, d.user+ " ➜ " + irc.colors.wrap('light_magenta', d.message));
                }

            })

        });

    }, 5000)
}

// memo //

function checkMemo(user) {
    db.all('SELECT i,timestamp,user,target,message from events WHERE type = "memo" AND UPPER(target) = UPPER(?)', user, (e,r) => {

        r.forEach(d => {

            if(Date.create(d.timestamp).isBefore('now')) {
                db.run('DELETE FROM events WHERE i = ?', d.i);
                var who = d.target == d.user ? "you" : d.user;
                client.say(config.channel, d.target+ ", " + who + " said " + d.message);
            }

        })

    });
}

// client //

var client = new irc.Client(config.server, config.username, {
    channels: [config.channel],
    userName: 'eternium',
    realName: 'none',
    floodProtection: true,
    floodProtectionDelay: 250,
    autoRejoin: true
});

client.addListener("registered", function(message) {
    console.log(message);
    client.say("nickserv", "identify " + config.password);
    init();
});

client.addListener('error', function(message) {
    console.log('error: ', message);
});

client.addListener("message", function(from, to, text, message) {

    context.getMessage([from, to, text, message, hide]);
    hard.getMessage([from, to, text, message, hide, context]);

    checkMemo(from);

    var getUrl = text.match(/(\b(https?):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig);

    // hardcoded commands //

    if (text == '~reset' || text == '~combobreaker') {
        process.exit();
    }

    var hardObj = hard.exists(text);

    if (hardObj) {
        hard.commands[hardObj.command](hardObj.params, hardObj.text);
    }

    // database commands //

    else if (text[0] == '~') {

        if(text.indexOf(' ') == -1) {
            var name = text.substring(1);
            var params = [];
        }
        else {
            var name = text.substring(1, text.indexOf(' '));
            var params = text.split(" ");
            params.shift();
        }

        var input = text.substring(text.indexOf(' ')+1);

        db.get('select command from commands where name = ?', name, (e,r) => {
            if(r) {
                try {

                    var loopNuke = loopProtect(r.command);

                    var response, command = safeEval(loopNuke, context.sandbox)

                    if(typeof command == "function"){
                        response = command.call(context.sandbox, input, params, {from, to, text, message});
                    }
                    else {
                        response = command;
                    }

                    if(response!=hide) client.say(to, response);

                }
                catch (e) {client.say(to, irc.colors.wrap('light_red', e))}
            }
        })

    }

    // url parse //

    else if (getUrl && getUrl[0]) {

        request(getUrl[0], function (error, response, body) {
            if (!error && response.statusCode == 200) {

                try {

                    var title = /<title>(.*?)<\/title>/ig.exec(body);

                    if(title && title[1]) {

                        var data =
                            irc.colors.wrap('light_blue', '>>') +
                            entities.decode(title[1]);

                        if (data.length < 400) {

                            client.say(to, data);

                        }

                    }


                }
                catch (e) {client.say(to, e)}
            }
        })


    }

});
