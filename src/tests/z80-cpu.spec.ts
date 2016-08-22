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

import chai = require('chai');
import {Z80Cpu} from '../hardware/arch/z80';
import {Operations, operations} from '../hardware/arch/z80-operations';
import {Instruction} from '../hardware/arch/instruction';
import {Operand} from '../hardware/arch/instruction';

import {Ram} from '../hardware/ram';

require('source-map-support').install();

chai.should();
let expect = chai.expect;

let cpu: Z80Cpu;
const ram: Ram = new Ram(1000);

describe('Z80 Cpu', () => {
  beforeEach(() => {
    cpu = new Z80Cpu();
    cpu.attachBus(ram);
  });

  it('should write carry flag', () => {
    cpu.carryFlag = true;
    cpu.writeFlags();

    expect(cpu.reg.F.value()).to.equal(0x1);
  });

  it('should write addition flag', () => {
    cpu.additionFlag = true;
    cpu.writeFlags();

    expect(cpu.reg.F.value()).to.equal(0x2);
  });

  it('should write parity flag', () => {
    cpu.parityFlag = true;
    cpu.writeFlags();

    expect(cpu.reg.F.value()).to.equal(0x4);
  });

  it('should write half-carry flag', () => {
    cpu.halfCarryFlag = true;
    cpu.writeFlags();

    expect(cpu.reg.F.value()).to.equal(0x10);
  });

  it('should write zero flag', () => {
    cpu.zeroFlag = true;
    cpu.writeFlags();

    expect(cpu.reg.F.value()).to.equal(0x40);
  });

  it('should write sign flag', () => {
    cpu.signFlag = true;
    cpu.writeFlags();

    expect(cpu.reg.F.value()).to.equal(0x80);
  });
});