var MetaUtil = require('../');
var osmreplication = require('osmreplication');

var today = new Date();
var yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

var start = yesterday.toISOString().substr(0,10) + "T00:00:00";
var start_seq = osmreplication.file(start,'hour').sequenceNumber;
start_seq = String("000000000" + start_seq).slice(-9);

var end = today.toISOString().substr(0,10) + "T01:30:00Z";
var end_seq = osmreplication.file(end,'hour').sequenceNumber;
end_seq = String("000000000" + end_seq).slice(-9);

var actual_end = yesterday.toISOString().substr(0,10) + "T23:59:59Z";

//console.log(start_seq + " " + end_seq + " " + start + " " + actual_end);
//return;
//Using as a command line utility
MetaUtil({
    'start': start_seq,
    'end': end_seq,
    'delay': 100,
    'start_timestamp': start,
    'end_timestamp': actual_end
}).pipe(process.stdout)

//Call with node cmd.js 001181708 001181721