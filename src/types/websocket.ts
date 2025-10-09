export interface BaseEvent {
  event_id: string
  type: string
}

export interface SessionUpdateEvent extends BaseEvent {
  type: 'session.update'
  session: SessionConfig
}

export interface ResponseCreateEvent extends BaseEvent {
  type: 'response.create'
  response: {
    instructions?: string
    modalities: ('text' | 'audio')[]
  }
}

export interface ResponseCancelEvent extends BaseEvent {
  type: 'response.cancel'
}

export interface InputAudioBufferAppendEvent extends BaseEvent {
  type: 'input_audio_buffer.append'
  audio: string
}

export interface InputAudioBufferCommitEvent extends BaseEvent {
  type: 'input_audio_buffer.commit'
}

export interface InputAudioBufferClearEvent extends BaseEvent {
  type: 'input_audio_buffer.clear'
}

export interface InputImageBufferAppendEvent extends BaseEvent {
  type: 'input_image_buffer.append'
  image: string
}

export type ClientEvent =
  | SessionUpdateEvent
  | ResponseCreateEvent
  | ResponseCancelEvent
  | InputAudioBufferAppendEvent
  | InputAudioBufferCommitEvent
  | InputAudioBufferClearEvent
  | InputImageBufferAppendEvent

export interface SessionConfig {
  modalities: ('text' | 'audio')[]
  voice?: string
  input_audio_format: 'pcm16'
  output_audio_format: 'pcm24'
  smooth_output?: boolean | null
  turn_detection: TurnDetection | null
  input_audio_transcription?: {
    model: string
  }
  instructions?: string
  tools?: any[]
  tool_choice?: string
  temperature?: number
  max_response_output_tokens?: string
}

export interface TurnDetection {
  type: 'server_vad'
  threshold: number
  silence_duration_ms: number
  create_response?: boolean
  interrupt_response?: boolean
}

export interface ErrorEvent extends BaseEvent {
  type: 'error'
  error: {
    type: string
    code: string
    message: string
    param?: string
  }
}

export interface SessionCreatedEvent extends BaseEvent {
  type: 'session.created'
  session: {
    id: string
    object: string
    model: string
    modalities: ('text' | 'audio')[]
    voice: string
    input_audio_format: 'pcm16'
    output_audio_format: 'pcm24'
    input_audio_transcription?: {
      model: string
    }
    turn_detection: TurnDetection | null
  }
}

export interface SessionUpdatedEvent extends BaseEvent {
  type: 'session.updated'
  session: {
    id: string
    object: string
    model: string
    modalities: ('text' | 'audio')[]
    voice: string
    input_audio_format: 'pcm16'
    output_audio_format: 'pcm24'
    input_audio_transcription?: {
      model: string
    }
    turn_detection: TurnDetection | null
  }
}

export interface InputAudioBufferSpeechStartedEvent extends BaseEvent {
  type: 'input_audio_buffer.speech_started'
  audio_start_ms: number
  item_id: string
}

export interface InputAudioBufferSpeechStoppedEvent extends BaseEvent {
  type: 'input_audio_buffer.speech_stopped'
  audio_end_ms: number
  item_id: string
}

export interface InputAudioBufferCommittedEvent extends BaseEvent {
  type: 'input_audio_buffer.committed'
  item_id: string
}

export interface InputAudioBufferClearedEvent extends BaseEvent {
  type: 'input_audio_buffer.cleared'
}

export interface ConversationItemCreatedEvent extends BaseEvent {
  type: 'conversation.item.created'
  item: {
    id: string
    object: string
    type: string
    status: string
    role: string
    content: Array<{
      type: string
      text?: string
      audio?: string
    }>
  }
}

export interface ConversationItemInputAudioTranscriptionCompletedEvent extends BaseEvent {
  type: 'conversation.item.input_audio_transcription.completed'
  item_id: string
  content_index: number
  transcript: string
}

export interface ConversationItemInputAudioTranscriptionFailedEvent extends BaseEvent {
  type: 'conversation.item.input_audio_transcription.failed'
  item_id: string
  content_index: number
  error: {
    code: string
    message: string
    param?: string
  }
}

export interface ResponseCreatedEvent extends BaseEvent {
  type: 'response.created'
  response: {
    id: string
    object: string
    conversation_id: string
    status: 'completed' | 'failed' | 'in_progress' | 'incomplete'
    modalities: ('text' | 'audio')[]
    voice: string
    output_audio_format: string
    output: any[]
  }
}

export interface ResponseDoneEvent extends BaseEvent {
  type: 'response.done'
  response: {
    id: string
    object: string
    conversation_id: string
    status: 'completed' | 'failed' | 'in_progress' | 'incomplete'
    modalities: ('text' | 'audio')[]
    voice: string
    output_audio_format: string
    output: Array<{
      id: string
      object: string
      type: string
      status: string
      role: string
      content: Array<{
        type: string
        text?: string
        transcript?: string
      }>
    }>
    usage: {
      total_tokens: number
      cached_tokens: number
      input_tokens: number
      output_tokens: number
      input_token_details: {
        text_tokens: number
        audio_tokens: number
      }
      output_token_details: {
        text_tokens: number
        audio_tokens: number
      }
    }
  }
}

export interface ResponseTextDeltaEvent extends BaseEvent {
  type: 'response.text.delta'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  delta: string
}

export interface ResponseTextDoneEvent extends BaseEvent {
  type: 'response.text.done'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  text: string
}

export interface ResponseAudioDeltaEvent extends BaseEvent {
  type: 'response.audio.delta'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  delta: string
}

export interface ResponseAudioDoneEvent extends BaseEvent {
  type: 'response.audio.done'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
}

export interface ResponseAudioTranscriptDeltaEvent extends BaseEvent {
  type: 'response.audio_transcript.delta'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  delta: string
}

export interface ResponseAudioTranscriptDoneEvent extends BaseEvent {
  type: 'response.audio_transcript.done'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  transcript: string
}

export interface ResponseOutputItemAddedEvent extends BaseEvent {
  type: 'response.output_item.added'
  response_id: string
  output_index: number
  item: {
    id: string
    object: string
    type: string
    status: string
    role: string
    content: any[]
  }
}

export interface ResponseOutputItemDoneEvent extends BaseEvent {
  type: 'response.output_item.done'
  response_id: string
  output_index: number
  item: {
    id: string
    object: string
    type: string
    status: string
    role: string
    content: Array<{
      type: string
      text?: string
    }>
  }
}

export interface ResponseContentPartAddedEvent extends BaseEvent {
  type: 'response.content_part.added'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  part: {
    type: string
    text?: string
  }
}

export interface ResponseContentPartDoneEvent extends BaseEvent {
  type: 'response.content_part.done'
  response_id: string
  item_id: string
  output_index: number
  content_index: number
  part: {
    type: string
    text?: string
  }
}

export interface ConnectionEstablishedEvent extends BaseEvent {
  type: 'connection.established'
  message: string
}

export type ServerEvent =
  | ErrorEvent
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | InputAudioBufferCommittedEvent
  | InputAudioBufferClearedEvent
  | ConversationItemCreatedEvent
  | ConversationItemInputAudioTranscriptionCompletedEvent
  | ConversationItemInputAudioTranscriptionFailedEvent
  | ResponseCreatedEvent
  | ResponseDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseAudioDeltaEvent
  | ResponseAudioDoneEvent
  | ResponseAudioTranscriptDeltaEvent
  | ResponseAudioTranscriptDoneEvent
  | ResponseOutputItemAddedEvent
  | ResponseOutputItemDoneEvent
  | ResponseContentPartAddedEvent
  | ResponseContentPartDoneEvent
  | ConnectionEstablishedEvent

export type WebSocketEvent = ClientEvent | ServerEvent