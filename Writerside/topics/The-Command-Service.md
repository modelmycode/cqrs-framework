# The Command Service
The write side of CQRS is handled by the command service. Only the command service uses the concept of aggregates, as the command service is the only service that will actually change the state of a system.
There are alternatives that do not use aggregates at all, but for now we prefer to use them as it allows nice way to enforce consistent use of applying state.
![command-service.png](command-service.png)

This service contains all functionality to implement: 
- communicate with axon server using command and event bus.
- command handlers:
  - validate incoming commands (Anti Corruption Layer) for the application service/command handlers.
  - create or load (de-hydrate) an aggregate 
  - inject additional services required by the domain layer 
  - call aggregate function
  - persist and publish events
  - optional return response value 
- aggregates:
  - execute the business rules that need to be checked to determine what event(s) should be applied.
  - return an array of events to the calling command handler
  - event sourcing handlers that are used when loading an aggregate to rebuild the current state of the aggregate.

