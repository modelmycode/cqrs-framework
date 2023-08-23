import {
  ChannelCredentials,
  ClientOptions,
  credentials,
  loadPackageDefinition,
} from '@grpc/grpc-js'
import { loadAxonClient } from 'axon-server-node-api'

const clients = loadAxonClient(loadPackageDefinition)

export interface AxonServiceClientInit {
  address: string
  credentials?: ChannelCredentials
  options?: Partial<ClientOptions>
}

export function createPlatformServiceClient(init: AxonServiceClientInit) {
  return new clients.PlatformService(
    init.address,
    init.credentials || credentials.createInsecure(),
    init.options,
  )
}

export function createCommandServiceClient(init: AxonServiceClientInit) {
  return new clients.CommandService(
    init.address,
    init.credentials || credentials.createInsecure(),
    init.options,
  )
}

export function createQueryServiceClient(init: AxonServiceClientInit) {
  return new clients.QueryService(
    init.address,
    init.credentials || credentials.createInsecure(),
    init.options,
  )
}

export function createEventStoreClient(init: AxonServiceClientInit) {
  return new clients.EventStore(
    init.address,
    init.credentials || credentials.createInsecure(),
    init.options,
  )
}

export function createEventSchedulerClient(init: AxonServiceClientInit) {
  return new clients.EventScheduler(
    init.address,
    init.credentials || credentials.createInsecure(),
    init.options,
  )
}
