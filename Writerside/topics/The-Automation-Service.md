# The Automation Service

The automation service uses the approach of todo list processing instead of sagas.

![automation-service.png](automation-service.png)

A automation process handler consists of 4 elements:
- The read-model which contains only just enough facts to make the decision when to send a command and provide the command with the required parameters.
- The business rules required to check if a command can be sent.
- Sending a command
- Event handlers that support:
  - Adding a new todo record containing the start state.
  - Updating the read-model and updating the record in the todo-list
  - Removing (completing) the record in the todo-list when command published event successfully.

There can be multiple event handlers for each of the above.
The challenge with automation is to have a common key in all subscribed events that we can use to identify the record in the todo-list.
