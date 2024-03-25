# Overview

The purpose of this framework is to provide a clean and simple way to get started with CQRS (Command Query
Responsibility Separation) and Event-Sourcing.

There are many ways to achieve this, but we specifically wanted to have to code align very closely to
how you would model a process using event-modeling.

![image.png](image.png)

## What does the framework provide?

The framework allows you to define, build and deploy 5 types of services:

- A gateway service
- A command service
- A automation service
- A query service
- A query projection service

A key tool in setting up the framework is [**NX**](https://www.nx.dev). This provides a mono-repo structure to the project and
makes it very easy to expand projects while protecting the boundaries if each library.

The current version of the framework only supports [**Axon-Server**](https://www.axoniq.io)
as the event-store and message-bus. However, the framework has been set up to allow for different ES and message-bus
solutions.


