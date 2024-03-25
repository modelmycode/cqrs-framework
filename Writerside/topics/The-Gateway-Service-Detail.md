# The Gateway Service

A minimal implementation of a single entry-point to all services is provided through the gateway-service.

![gateway-service.png](gateway-service.png)

The gateway is an [express](https://expressjs.com/) server listening by default on **port: 3100.**
<p>A client app can call a command or query using the following:</p>
The gateway-service is a bare minimum implementation which only concern at the moment is mapping command and query
requests to command bus and query bus of Axon Server. 
<tabs>
<tab title="NodeJs">

```
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            command: props.command,
            payload: props.data,    
        });
        //query example
        //body: JSON.stringify({ 
        //    query: props.query,
        //    payload: props.filter,    
        //});
      }  

      await fetch(props.gatewayUrl, requestOptions)
        .then(async (response) => {
          if (response.status ===200 && response.status ===201) {
            return response.json();
          }
          console.error(`Send command failed : ${response.statusText}`)
          return
        })
        .catch((error) =>
          console.error(`Send command failed : ${error}`),
        );
```

</tab>
<tab title="cURL">

</tab>
</tabs>
