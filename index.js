var zlib = require('zlib');
var request = require('request');
var fs = require('fs');
var expat = require('node-expat');
var Readable = require('stream').Readable;
var util = require('util');

util.inherits(MetaUtil, Readable);

function MetaUtil(opts) {
    if (!(this instanceof MetaUtil)) return new MetaUtil(opts);

    opts = opts || {};
    Readable.call(this, opts);

    var that = this;
    this.liveMode = (!opts.start && !opts.end && !opts.delay);
    this.state = Number(opts.start) || 0;
    this.end = Number(opts.end) || 1;
    this.diff = this.end - this.state + 1;
    this.delay = (opts.delay || 60000);
    this.initialized = true;

    this.start_timestamp = opts.start_timestamp;
    this.end_timestamp = opts.end_timestamp;

    this.baseURL = opts.baseURL || 'http://planet.osm.org/replication/hour'; // 001/000.osc.gz -> 029/077.osc.gz
    this._changesetAttrs = {};
    this.started = false;
}

MetaUtil.prototype._read = function() {
    var that = this;
    if (!this.started) {
        if (this.liveMode) {
            request.get('http://planet.osm.org/replication/changesets/state.yaml',
            function(err, response, body) {
                that.state = Number(body.substr(body.length - 8));
                that.end = Infinity; //don't stop
                that.delay = 60000; //every minute
                that.run();
                that.started = true;
            }
        );
        } else {
            this.run();
            this.started = true;
        }
    }
};

MetaUtil.prototype.run = function() {
    var that = this;
    var numProcessed = 0;

    function queueNext() {
      that.diff -= 1;
      if (that.diff > 0 || that.liveMode) {
        setTimeout(function() {
          next();
        }, that.delay);
      }
    }

    var parserEnd = function(name, attrs) {
        if (name === 'node' || name === 'way' || name === 'relation') {
            var push = true;
            if (that.start_timestamp && that.start_timestamp > that._attrs.timestamp) push = false;
            if (that.end_timestamp && that.end_timestamp < that._attrs.timestamp) push = false;
            if (push) that.push(new Buffer(JSON.stringify(that._attrs) + '\n'), 'utf8');
            that._attrs = null;
        }
        if (name === 'osmChange') {
          queueNext();
          if (!that.liveMode && that.diff === 0) {
              that.push(null);
          }
        }
    };

    var parserStart = function(name, attrs) {
        if (name === 'create' || name === 'modify' || name === 'delete') {
            if (attrs) {
                that._action = name;
            }
        }
        if (name === 'node' || name === 'way' || name === 'relation') { //just managing nodes for now
            that._attrs = attrs;
            that._attrs['action'] = that._action;
            that._attrs['type'] = name;
        }

        if (name === 'tag' && that._attrs) {
            //FIX so that osm properties in namespace
            if (! that._attrs.hasOwnProperty(attrs.k)) {
              that._attrs[attrs.k] = attrs.v;            }
        }
    };

    function next()  {
        //Add padding
        var stateStr = that.state.toString().split('').reverse();
        var diff = 9 - stateStr.length;
        for (var i=0; i < diff; i++) { stateStr.push('0'); }
        stateStr = stateStr.join('');

        //Create URL
        var url = '';
        for (i=0; i<(stateStr.length/3); i++) {
            url += stateStr[i*3] + stateStr[i*3 + 1] + stateStr[i*3 + 2] + '/';
        }

        //XML Parser
        var xmlParser = new expat.Parser('UTF-8');
        xmlParser.on('startElement', parserStart);
        xmlParser.on('endElement', parserEnd);

        //Get YAML state file
        request.get(this.baseURL + '/state.txt',
            function(err, response, body) {
                var nodata = true;
                //If YAML state is bigger, we can get a new file
                if (true || Number(body.substr(body.length - 8)) >= that.state) { //need to parse state.txt
                    var ss = request.get(that.baseURL + url.split('').reverse().join('') + '.osc.gz')
                        .pipe(zlib.createUnzip())
                        .on('data', function(data) {
                          nodata = (data.length === 0) && nodata;
                        })
                        .on('end', function() {
                          if (nodata) {
                            queueNext();
                            ss.end();
                          }
                        })
                        .pipe(xmlParser);

                    that.state += 1;
                }
            }
        );
    }
    next();
};

module.exports = MetaUtil;
