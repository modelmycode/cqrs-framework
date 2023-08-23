import { InstructionAck } from 'axon-server-node-api'

export class AxonInstructionMap {
  private readonly map = new Map<string, (act: InstructionAck) => void>()

  public add(instructionId: string, onAct: (act: InstructionAck) => void) {
    this.map.set(instructionId, onAct)
  }

  public remove(instructionId: string): void {
    this.map.delete(instructionId)
  }

  public onAct(act: InstructionAck | undefined): void {
    if (!act) return
    const instructionId = act.getInstructionId()
    if (!instructionId || !this.map.has(instructionId)) return

    this.map.get(instructionId)?.(act)
    this.map.delete(instructionId)
  }
}
