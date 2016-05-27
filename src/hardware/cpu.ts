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

import {Ram} from './ram';
import {Rom} from './rom';
import {Bus} from './bus';
import {IoBus} from './io-bus';

export enum IoLink {
  ReadLink,
  WriteLink,
  ReadWriteLink
}

export interface Cpu {
  attachBus(bus: Bus);
  bus(): Bus;
  attachIoBus(ioBus:IoBus);
  ioBus(): IoBus;

  tick(cycles: number): number;
}
