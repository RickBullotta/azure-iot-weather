/*
* IoT Hub Philips Hue NodeJS - Microsoft Sample Code - Copyright (c) 2018 - Licensed MIT
*/
'use strict';

const fs = require('fs');
const path = require('path');

const Client = require('azure-iot-device').Client;
const ConnectionString = require('azure-iot-device').ConnectionString;
const Message = require('azure-iot-device').Message;
const Protocol = require('azure-iot-device-mqtt').Mqtt;

var request = require('request');

var messageId = 0;
var deviceId;
var client;
var config;

var postalCode;
var countryCode;


var sendingMessage = true;

function sendUpdatedTelemetry(telemetry) {
	if (!sendingMessage) { return; }
  
	var content = {
	  messageId: ++messageId,
	  deviceId: deviceId
	};
  
	var rawMessage = JSON.stringify(telemetry);
  
	console.log("Sending:");
	console.log(rawMessage);
  
	var message = new Message(rawMessage);
  
	if (config.infoOutboundMessages)
	  console.info('Sending Telemetry Update to Azure IoT Hub');
  
	if (config.debugOutboundMessages)
	  console.debug(rawMessage);
  
	client.sendEvent(message, (err) => {
	  if (err) {
		console.error('Failed to send telemtry to Azure IoT Hub');
	  } else {
		if (config.infoOutboundMessages)
		  console.info('Telemetry successfully sent to Azure IoT Hub');
	  }
	});
}
  
function convertPayload(request) {
	if(typeof(request.payload) == "string") {
		try {
			request.payload = JSON.parse(request.payload);
		}
		catch(e) {

		}
	}
}

function getWeather(callback) {
	var self = this;

	var apiURL = "http://api.openweathermap.org/data/2.5/weather?zip=" + postalCode + "," + countryCode + "&units=imperial&APPID=" + config.apiKey;

	var jsonContent = {};

	var requestOptions = {
		url: apiURL,
		forever: true,
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'Cache-Control': 'no-cache'
		}
	};

	request.get(
		requestOptions,
		function resultCallback(err, httpResponse, body) {
			if (callback) {
				if (err) {
					callback(err, null, null);
				}
				else {
					if (httpResponse.statusCode >= 400) {
						callback(new Error(httpResponse.statusMessage), null);
					}
					else {
						if (this.trace)
							console.debug(body);

						try {
							var rawResult = JSON.parse(body);

							var temperature = parseFloat(rawResult["main"]["temp"]);
							var humidity = parseFloat(rawResult["main"]["humidity"]);
							var pressure = parseFloat(rawResult["main"]["pressure"]);
							var windSpeed = parseFloat(rawResult["wind"]["speed"]);
							var windDirection = parseFloat(rawResult["wind"]["deg"]);
							var lon = parseFloat(rawResult["coord"]["lon"]);
							var lat  = parseFloat(rawResult["coord"]["lat"]);

							var weather = {};

							weather["temperature"] = temperature;
							weather["humidity"] = humidity;
							weather["pressure"] = pressure;
							weather["windSpeed"] = windSpeed;
							weather["windDirection"] = windDirection;
							weather["location"] = {"lon" : lon, "lat" : lat};

							console.log(JSON.stringify(weather));

							callback(null, weather);
						}
						catch(eParse) {
							callback(eParse, null);
						}
					}
				}
			}
		}
	);
}

function onStart(request, response) {
	if (config.infoMethods)
		console.info('Try to invoke method start(' + request.payload || '' + ')');

	sendingMessage = true;

	convertPayload(request);
	
	response.send(200, 'Successully start sending message to cloud', function (err) {
		if (err) {
			console.error('[IoT hub Client] Failed sending a method response:\n' + err.message);
		}
	});
}

function onStop(request, response) {
	if (config.infoMethods)
		console.info('Try to invoke method stop(' + request.payload || '' + ')')

	sendingMessage = false;

	convertPayload(request);
	
	response.send(200, 'Successully stop sending message to cloud', function (err) {
		if (err) {
			console.error('[IoT hub Client] Failed sending a method response:\n' + err.message);
		}
	});
}

function onReceiveMessage(msg) {
	var message = msg.getData().toString('utf-8');

	client.complete(msg, () => {
		if (config.infoInboundMessages)
			console.info('Incoming Message Received');

		if (config.debugInboundMessages)
			console.debug(message);
	});
}

function initClient(connectionStringParam, credentialPath) {
	var connectionString = ConnectionString.parse(connectionStringParam);
	deviceId = connectionString.DeviceId;

	// fromConnectionString must specify a transport constructor, coming from any transport package.
	client = Client.fromConnectionString(connectionStringParam, Protocol);

	// Configure the client to use X509 authentication if required by the connection string.
	if (connectionString.x509) {
		// Read X.509 certificate and private key.
		// These files should be in the current folder and use the following naming convention:
		// [device name]-cert.pem and [device name]-key.pem, example: myraspberrypi-cert.pem
		var connectionOptions = {
			cert: fs.readFileSync(path.join(credentialPath, deviceId + '-cert.pem')).toString(),
			key: fs.readFileSync(path.join(credentialPath, deviceId + '-key.pem')).toString()
		};

		client.setOptions(connectionOptions);

		console.debug('[Device] Using X.509 client certificate authentication');
	}
	return client;
}

function checkLocation(client) {
	if (config.infoConfigurationSync)
		console.info("Syncing Device Twin...");

	client.getTwin((err, twin) => {

		if (err) {
			console.error("Get twin message error : " + err);
			return;
		}

		if (config.debugConfigurationSync) {
			console.debug("Desired:");
			console.debug(JSON.stringify(twin.properties.desired));
			console.debug("Reported:");
			console.debug(JSON.stringify(twin.properties.reported));
		}

		var twinPostalCode = twin.properties.desired.postalCode.value;
		var twinCountryCode = twin.properties.desired.countryCode.value;

		if((twinPostalCode && twinPostalCode != '') && (twinCountryCode && twinCountryCode != '')) {
			if(twinPostalCode != postalCode || twinCountryCode != countryCode) {
				postalCode = twinPostalCode;
				countryCode = twinCountryCode;

				console.log("Location Set To " + postalCode + " " + countryCode);
				
				checkWeather(client);

				if (config.infoConfigurationSync)
					console.info("Updating device twin...");

				// Update the device twin

				var twinUpdate = {};

				twinUpdate.postalCode = postalCode;
				twinUpdate.countryCode = countryCode;

				twin.properties.reported.update(twinUpdate, function (err) {
					if (err) {
						console.error("Unable To Update Device Twin : " + err)
					}

					if (config.infoConfigurationSync)
						console.info("Device Twin Updated");
				});
			}
		}
	})

}

function checkWeather(client) {
	if(postalCode && postalCode != '' && countryCode && countryCode != '') {
		getWeather(function(err,weather) {
			if(err) {
				console.error('Unable to get weather for ' + postalCode + "-" + countryCode + ' : ' + err);
			}
			else {
				sendUpdatedTelemetry(weather);
			}
		});
	}

}


(function (connectionString) {
	// read in configuration in config.json
	try {
		config = require('./config.json');
	} catch (err) {
		console.error('Failed to load config.json: ' + err.message);
		return;
	}

	// create a client
	// read out the connectionString from process environment
	connectionString = connectionString || process.env['AzureIoTHubDeviceConnectionString'];
	client = initClient(connectionString, config);

	client.open((err) => {
		if (err) {
			console.error('[IoT hub Client] Connect error: ' + err.message);
			return;
		}
		else {
			console.log('[IoT hub Client] Connected Successfully');
		}

		// set C2D and device method callback
		client.onDeviceMethod('start', onStart);
		client.onDeviceMethod('stop', onStop);

		client.on('message', onReceiveMessage);

		checkLocation(client);

		setInterval(() => {
			checkWeather(client);
		}, config.interval);

	});
})(process.argv[2]);
