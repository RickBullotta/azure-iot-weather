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

// DPS and connection stuff

const iotHubTransport = require('azure-iot-device-mqtt').Mqtt;

var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;

var provisioningHost = 'global.azure-devices-provisioning.net';

var request = require('request');

var client;
var config;

var postalCode;
var countryCode;


var sendingMessage = true;

function sendUpdatedTelemetry(telemetry) {
	if (!sendingMessage) { return; }
  
	var content = {
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
		console.error('Failed to send telemetry to Azure IoT Hub');
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
	
	response.send(200, 'Successfully start sending message to cloud', function (err) {
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
	
	response.send(200, 'Successfully stop sending message to cloud', function (err) {
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

function initClient() {

	// Start the device (connect it to Azure IoT Central).
	try {

		var provisioningSecurityClient = new SymmetricKeySecurityClient(config.registrationId, config.symmetricKey);
		var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, config.idScope, new ProvisioningTransport(), provisioningSecurityClient);

		provisioningClient.register((err, result) => {
			if (err) {
				console.log('error registering device: ' + err);
			} else {
				console.log('registration succeeded');
				console.log('assigned hub=' + result.assignedHub);
				console.log('deviceId=' + result.deviceId);

				var connectionString = 'HostName=' + result.assignedHub + ';DeviceId=' + result.deviceId + ';SharedAccessKey=' + config.symmetricKey;
				client = Client.fromConnectionString(connectionString, iotHubTransport);
			
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
			}
		});
	}
	catch(err) {
		console.log(err);
	}
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
	else {
		console.log('No weather location settings received yet...')
	}

}

// Read in configuration from config.json

try {
	config = require('./config.json');
} catch (err) {
	console.error('Failed to load config.json: ' + err.message);
	return;
}

// Initialize Azure IoT Client

initClient();
