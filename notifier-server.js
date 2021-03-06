var mailer,
	root = require( "path" ).dirname( __filename ),
	directory = root + "/notifier.d",
	os = require( "os" ),
	opts = require( "optimist" )
		.usage( "Start a server to listen for github post receives and execute scripts from a directory\n\t$0" )
		.options( "p", {
			alias: "port",
			"default": 3333,
			describe: "Port number for server"
		})
		.options( "d", {
			alias: "directory",
			"default": directory
		})
		.boolean( "console" )
		.describe( "console", "Log to console instead of syslog" );
	argv = opts.argv,
	port = argv.p,
	server = require( "git-notifier" ).createServer(),
	fs = require( "fs" ),
	proc = require( "child_process" ),
	logger = require( "simple-log" ).init( "notifier-server" ),
	invalidSHA = /[^0-9a-f]/;

if ( fs.existsSync( "./mail-config.json" ) ) {
	logger.log( "Loading E-Mail Component" );
	mailer = require( "./notify-mail.js" );
} else {
	// without mail config, mailer is a noop
	mailer = function() {};
}

directory = argv.d;

if ( argv.h ) {
	console.log( opts.help() );
	process.exit();
}

function makeExec( filename ) {

	function doLog( method, prefix, text ) {
		var parts = ("" + text).split(/\n/);
		parts.forEach(function( line ) {
			if ( line.length ) {
				logger[ method ]( prefix + line );
			}
		});
	}

	return function( data ) {
		var output = "",
			exit = -1;
		if ( invalidSHA.test( data.commit ) ) {
			logger.log( "Bad Request " + JSON.encode( data ) );
			return;
		}
		logger.log( "spawn: " + filename + " " + data.commit );
		var process = proc.spawn( directory + "/" + filename, [ data.commit ] );
		process.stdout.on( "data", function( data ) {
			output += data;
			doLog( "log", filename + ":out:", data );
		});
		process.stderr.on( "data", function( data ) {
			output += data;
			doLog( "log", filename + ":err:", data );
		});
		process.on( "exit", function( code ) {
			exit = code;
			doLog( "log", filename + ":exit:", code );
		});
		process.on( "close", function() {
			mailer( os.hostname() + ": Deployment: " + filename + " " + data.commit, output + "Exit Code: " + exit );
		});
	};
}

fs.readdirSync( directory ).forEach( function( file ) {
	if ( !/\.js$/.exec( file ) ) {
		return;
	}
	logger.log( "Including " + directory + "/" + file );
	var js = directory + "/" + file,
		sh = file.replace( /\.js$/, ".sh" );
	require( js )( server, makeExec( sh ) );
});

server.on( "error", function ( err ) {
	logger.error( "Error:", err );
});

logger.log( "Setting up post-receive server on port " + port );
server.listen( port );
