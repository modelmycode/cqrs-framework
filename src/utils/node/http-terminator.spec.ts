import { ChildProcess, fork } from 'child_process'
import * as path from 'path'

describe.skip('http-terminator', () => {
  let child: ChildProcess
  let exitCode: number
  let messages = ''

  beforeEach(() => {
    child = fork(path.resolve(__dirname, './http-terminator.test-case'), [], {
      execArgv: ['-r', 'ts-node/register'],
    })
    messages = ''
    exitCode = -1
  })

  afterEach(() => {
    child.kill()
  })

  it('should terminate application on uncaughtException', (done) => {
    child.on('message', (message) => {
      messages = `${messages}\n - ${message}`

      if (String(message).includes('event handlers added')) {
        child.send('throwUncaughtException')
      }
    })

    child.on('exit', (code: number) => {
      exitCode = code
    })

    child.on('close', () => {
      expect(exitCode).toEqual(1)
      expect(messages).toContain('Uncaught Exception - application closing')
      expect(messages).toContain('Uncaught Exception - application closed')
      expect(messages).toContain('application close')
      done()
    })
  })

  it('should terminate application on unhandledRejection', (done) => {
    child.on('message', (message) => {
      messages = `${messages}\n - ${message}`

      if (String(message).includes('event handlers added')) {
        child.send('throwUnhandledRejection')
      }
    })

    child.on('exit', (code: number) => {
      exitCode = code
    })

    child.on('close', () => {
      expect(exitCode).toEqual(1)
      expect(messages).toContain('Unhandled Rejection - application closing')
      expect(messages).toContain('Unhandled Rejection - application closed')
      expect(messages).toContain('application close')
      done()
    })
  })

  it('should terminate application on SIGTERM', (done) => {
    child.on('message', (message) => {
      messages = `${messages}\n - ${message}`

      if (String(message).includes('event handlers added')) {
        child.kill('SIGTERM')
      }
    })

    child.on('exit', (code: number) => {
      exitCode = code
    })

    child.on('close', () => {
      expect(exitCode).toEqual(0)
      expect(messages).toContain('SIGTERM - application closing')
      expect(messages).toContain('SIGTERM - application closed')
      expect(messages).toContain('application close')
      done()
    })
  })

  it('should terminate application on SIGINT', (done) => {
    child.on('message', (message) => {
      messages = `${messages}\n - ${message}`

      if (String(message).includes('event handlers added')) {
        child.kill('SIGINT')
      }
    })

    child.on('exit', (code: number) => {
      exitCode = code
    })

    child.on('close', () => {
      expect(exitCode).toEqual(0)
      expect(messages).toContain('SIGINT - application closing')
      expect(messages).toContain('SIGINT - application closed')
      expect(messages).toContain('application close')
      done()
    })
  })
})
