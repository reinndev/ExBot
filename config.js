const { version } = require("process");
const whitelist = require("./database/whitelst.json");

module.exports = {
    // Config Bot
    author: "reinn. dev",
    ownerNum: ["082127605956"],
    prefix: "!",
    botName: "ExBot",
    version: "1.0.0",
    autoRead: true,
    autoBio: true,
    autoTyping: false,
    autoRecord: false,

    // Config Whitelist
    allowedGroup: whitelist.groups,

    // Config Database
    dbPath: {
        user: "./database/user.json",
        area: "./database/area.json",
        pet: "./database/pet.json",
    },
}