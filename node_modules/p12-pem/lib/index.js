"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPemFromP12 = exports.Name = void 0;
var p12_1 = require("./lib/p12");
var fs = require("fs");
var Name = function (name) { return "Hello ".concat(name); };
exports.Name = Name;
function getPemFromP12(certPath, password) {
    var p12File = fs.readFileSync(certPath, { encoding: 'binary' });
    return (0, p12_1.convertToPem)(p12File, password);
}
exports.getPemFromP12 = getPemFromP12;
