import { AiFieldCore } from '@teable/core';
import { Mixin } from 'ts-mixer';
import { Field } from './field';

export class AiField extends Mixin(AiFieldCore, Field) {}
