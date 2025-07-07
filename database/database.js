const fs = require('fs');
const path = require('path');

const userPath = path.join(__dirname, 'user.json');
const areaPath = path.join(__dirname, 'area.json');
const petPath = path.join(__dirname, 'pet.json');

if (!fs.existsSync(userPath))
    fs.writeFileSync(userPath, '{}');
if (!fs.existsSync(areaPath))
    fs.writeFileSync(areaPath, '{}');
if (!fs.existsSync(petPath))
    fs.writeFileSync(petPath, '{}');


let userDb = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
let areaDb = JSON.parse(fs.readFileSync(areaPath, 'utf-8'));
let petDb = JSON.parse(fs.readFileSync(petPath, 'utf-8'));

function saveUserDb() {
    fs.writeFileSync(userPath, JSON.stringify(userDb, null, 2));
}

function saveAreaDb() {
    fs.writeFileSync(areaPath, JSON.stringify(areaDb, null, 2));
}

function savePetDb() {
    fs.writeFileSync(petPath, JSON.stringify(petDb, null, 2));
}

module.exports = {
    userDb, saveUserDb,
    areaDb, saveAreaDb,
    petDb, savePetDb
}