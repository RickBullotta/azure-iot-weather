---
services: iot-hub, iot-central
platforms: Nodejs
author: rickb
---

# Azure IoT Hub/IoT Central Weather Data Interface

This utilizes the Azure IoT Node.js SDK to connect to a weather API and will send weather data as telemetry to Azure IoT.

# How To Run This Device Connector 

Launch index.js with a single parameter, which is the connection string generated from IoT Hub or IoT Central.  Note that when using IoT Central, you'll need to utilize the dps_cstr utility to generate this connection string.

# How To Configure This Device Connector

In the config.json file, you'll need to provide an free API key for the OpenWeatherMap API service.  This can be obtained via the following link: https://home.openweathermap.org/users/sign_up.  

  "apiKey" : "<YourApiKey>"

In this same file, you specify the interval in milliseconds to specify how frequently weather values will be sent to Azure IoT.  Note that weather data from this API does not change frequently (it is not real time), so intervals such as 5, 10, or 15 minutes will be optimal.

  "interval": 300000

On the server side, in IoT Central, configure a "setting" with the property names "postalCode" and "countryCode", which correspond to the weather location to be monitored.  When this connector starts up, it will request that information from Azure IoT.  Refer to the OpenWeatherMap API documentation for a list of two character country codes.

# Features

This connector allows you to acquire weather information for a specific location and send that information to Azure IoT Central for display, rules, and analysis.  It will send barometric pressure, temperature, humidity, wind speed, and wind direction, though it could easily be modified/enhanced to send more data.
