# The Command Service
The write side of CQRS is handled by the command service. Only the command service uses the concept of aggregates, as the command service is the only service that will actually change the state of a system.
There are alternatives that do not use aggregates at all, but for now we prefer to use them as it allows nice way to enforce consistent use of applying state.
![command-service.png](command-service.png)

## API definition
First step in being able to use commands will be to define the commands.
This is pretty straight-forward but we do have to take into account that we have two ways to define a command:
- The first way, and preferred way, is sending a command as send and forget. We are living in an async world and should not expect results back. The only response we should expect is that the command has been received and will be processed.
- The second ways is a so called **responding** command. The definition will include what will be returned after the command has successfully been executed.

### Command definition
//libs/api/web-translator-command/src/translation/approve-translation-price.ts
![image_6.png](image_6.png)

### Responding command definition
//libs/api/web-translator-command/src/translation/submit-translation-request.ts
![image_5.png](image_5.png)

## Command Handler
A command-handler is the core functionality of the write side of a CQRS architecture. Because of this the project it belongs to is **ContextName-core**. For example **web-translator-core**.

It belongs to the application layer and needs to be registered with the command-service.
Command-handlers are organised per aggregate and are called **AggregateName**ApplicationService.

![image_7.png](image_7.png)

To provide a clean way to register the command handlers we use a separate AggregateConfig

![image_8.png](image_8.png)
This is what we use in the command service to register the command handlers.

![image_9.png](image_9.png)