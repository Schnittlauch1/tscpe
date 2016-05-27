/*  TSEPC
    Copyright (C) 2016  Phil Lehmkuhl

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';
import {Cpu} from '../cpu';
import {IoLink} from '../cpu';
import {IoPort} from '../io-port';
import {IoBus} from '../io-bus';
import {Ram} from '../ram';
import {Rom} from '../rom';
import {Bus} from '../bus';

import {Register} from './z80-register';
import {Registers} from './z80-register';

//import {InstructionDecoder} from './z80-decoder';
import {Instruction} from './instruction';
import {add} from './z80-operations';
import {sub} from './z80-operations';
import {parity} from './z80-operations';

import EventEmitter = require('eventemitter3');
import winston = require('winston');

const InstructionLog = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({ filename: 'instructions.log', json: false, timestamp: false })
  ]
});

const enum CPUState {
  Execute = 0,
  CheckInterrupt = 1
};

export class Z80Cpu 
  extends EventEmitter
  implements Cpu
  
{
  private memoryBus: Bus = null;
  private io: IoBus = null;
  private r = new Registers;
  //private decoder: InstructionDecoder = new InstructionDecoder;
  private instruction: Instruction = new Instruction(this);

  private interruptFlag1: boolean = false;
  private interruptFlag2: boolean = false;
  private interruptAknowleged: boolean = false;
  private interruptMode: number = 0;
  private interruptRequest: boolean = false;
  
  private carryFlag_: number = 0;
  private zeroFlag_: number = 0;
  private parityFlag_: number = 0;
  private signFlag_: number = 0;
  private additionFlag_: number = 0;
  private halfCarryFlag_: number = 0;

  public constructor() {
    super();
  }
  
  set interrupt(val: boolean) {
    this.interruptRequest = val;
  }

  get iff1(): boolean {
    return this.interruptFlag1;
  }
  
  set iff1(val: boolean) {
    this.interruptFlag1 = val;
  }
  
  get iff2(): boolean {
    return this.interruptFlag2;
  }
  
  set iff2(val: boolean) {
    this.interruptFlag2 = true;
  }
  
  get im(): number {
    return this.interruptMode;
  }
  
  set im(val: number) {
    this.interruptMode = val;
  }
  
  get carryFlag(): boolean {
    return (this.carryFlag_) !== 0;
  }
  
  set carryFlag(val: boolean) {
    this.carryFlag_ = val ? 0x1 : 0;
  }
  
  get zeroFlag(): boolean {
    return (this.zeroFlag_) !== 0;
  }
  
  set zeroFlag(val: boolean) {
    this.zeroFlag_ = val ? 0x40 : 0;
  }
  
  get parityFlag(): boolean {
    return (this.parityFlag_) !== 0;
  }
  
  set parityFlag(val: boolean) {
    this.parityFlag_ = val ? 0x4 : 0;
  }
  
  get signFlag(): boolean {
    return (this.signFlag_) !== 0;
  }
  
  set signFlag(val: boolean) {
    this.signFlag_ = val ? 0x80 : 0;
  }
  
  get additionFlag(): boolean {
    return (this.additionFlag_) !== 0;
  }
  
  set additionFlag(val: boolean) {
    this.additionFlag_ = val ? 0x2 : 0;
  }
  
  get halfCarryFlag(): boolean {
    return (this.halfCarryFlag_) !== 0;
  }
  
  set halfCarryFlag(val: boolean) {
    this.halfCarryFlag_ = val ? 0x10 : 0;
  }
  
  public readFlags(val: number) {
    this.carryFlag_ = val & 0x1;
    this.halfCarryFlag_ = val & 0x10;
    this.additionFlag_ = val & 0x2;
    this.signFlag_ = val & 0x80;
    this.parityFlag_ = val & 0x4;
    this.zeroFlag_ = val & 0x40;
  }
  
  public writeFlags() {
    this.reg.F.uint = this.carryFlag_ | 
      this.additionFlag_ | 
      this.signFlag_ | 
      this.parityFlag_ | 
      this.halfCarryFlag_ | 
      this.zeroFlag_;
  }

  get reg(): Registers {
    return this.r;
  }

  public attachBus(bus: Bus) {
    this.memoryBus = bus;
  }

  public bus(): Bus {
    return this.memoryBus;
  }

  attachIoBus(ioBus:IoBus) {
    this.io = ioBus;
  }

  ioBus(): IoBus {
    return this.io;
  }
 
  private handleInterrupt(): boolean {
    if(this.interruptMode !== 1) { return false; }

    this.interruptFlag1 = false;
    this.interruptFlag2 = false;
  
    this.reg.SP.uint--;
    this.bus().writeMemory(this.reg.SP.uint, this.reg.PC.hi.uint);
    this.reg.SP.uint--;
    this.bus().writeMemory(this.reg.SP.uint, this.reg.PC.lo.uint);

    this.reg.PC.uint = 0x0038;

    this.emit('INTACK');
    
    return true;
  }
  
  private cpuState: CPUState = CPUState.Execute;
  private stateExec = [
    this.performExecute,
    this.performInterruptCheck
  ];
  
  private performFetch(): void {
    let offset = this.r.PC.uint;
    
    if(this.instruction.address !== offset) {
      this.instruction.address = this.r.PC.uint;
      this.instruction.decode();
    }
    
    this.r.PC.uint = offset + this.instruction.size;
    
    //InstructionLog.info(this.instruction.address.toString(16).toUpperCase() + ' ' + this.instruction.toString());

  }
  
  private performExecute(): number {
    let waitStates: number = 0;
    
    this.performFetch();
    
    waitStates = this.instruction.operation(this, this.instruction);
    this.writeFlags();
   
   
    /*InstructionLog.info('A: ' + this.r.A.uint.toString(16) + 
                ' F: ' + this.r.F.uint.toString(16) +
                ' B: ' + this.r.B.uint.toString(16) +
                ' C: ' + this.r.C.uint.toString(16) +
                ' D: ' + this.r.D.uint.toString(16) +
                ' E: ' + this.r.E.uint.toString(16) +
                ' H: ' + this.r.H.uint.toString(16) +
                ' L: ' + this.r.L.uint.toString(16) +
                ' SP: ' + this.r.SP.uint.toString(16)); */
    
    if(this.interruptFlag1 === true && this.interruptRequest) {
      this.cpuState = CPUState.CheckInterrupt;
    }

    return waitStates;
  }
  
  private performInterruptCheck(): number {
    this.cpuState = CPUState.Execute;
    
    if(this.handleInterrupt()) { return 6; }

    return 0;
  }

  public tick(cycles: number): number {
    switch(this.cpuState) {
      case CPUState.Execute:
        return this.performExecute();
      
      case CPUState.CheckInterrupt:
        return this.performInterruptCheck();
    }
  }
}
