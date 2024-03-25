# The Gateway Service

A minimal implementation of a single entry-point to all services is provided through the gateway-service.

![gateway-service.png](gateway-service.png)

The gateway is an [express](https://expressjs.com/) server listening by default on **port: 3100.**
<p>A client app can call a command or query using the following:</p>


The gateway-service is a bare minimum implementation which only concern at the moment is mapping command and query
requests to command bus and query bus of Axon Server. 
<tip>
<b>Authorisation</b> and other routing concerns should be added to the gateway.
</tip>