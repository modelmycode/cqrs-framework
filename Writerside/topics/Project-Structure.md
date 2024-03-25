# Project Structure

The project structure is based on following the onion-architecture approach. The separation between infrastructure, application and domain is strictly enforced. Each area will have its own projects and the separation is enforced by the linter.


![onion_architecture.png](onion_architecture.png)

In addition to the onion structure we also take into account that different contexts should have no knowledge of eachother. This means we will have projects/folders repeated per instance of a context.
Infrastructure libraries can be consumed throughout the project, but application layers and domain-layers are specific to contexts and should not be linked to other contexts. Only use events for inter-context communication!


![folder_structure.png](folder_structure.png)

The lighter blue color is to indicate that these folders/files are all changed by a context. In the case of the apps it will be just registering the command/query and query-handlers.
The apps/WebApp is to refer to one or more front-end applications. The principle of nx is that you have as little as possible in the actual application and push everything else into libraries. 