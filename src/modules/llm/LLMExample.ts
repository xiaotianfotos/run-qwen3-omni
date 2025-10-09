import { LLM, type Tool } from './LLM';

// 测试工具示例
export const testTool: Tool = {
  name: 'test',
  description: '一个测试工具，用于验证工具调用功能',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '要显示的消息'
      }
    },
    required: ['message']
  },
  handler: async (args: { message: string }) => {
    console.log('🔧 测试工具被调用:', args);

    // 在浏览器中显示alert
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(`测试工具调用成功！消息: ${args.message}`);
    }

    return {
      success: true,
      message: `测试工具调用成功: ${args.message}`,
      timestamp: new Date().toISOString()
    };
  }
};

// 计算器工具示例
export const calculatorTool: Tool = {
  name: 'calculator',
  description: '一个简单的计算器工具，可以进行基本的数学运算',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: '运算类型: add, subtract, multiply, divide',
        enum: ['add', 'subtract', 'multiply', 'divide']
      },
      a: {
        type: 'number',
        description: '第一个数字'
      },
      b: {
        type: 'number',
        description: '第二个数字'
      }
    },
    required: ['operation', 'a', 'b']
  },
  handler: async (args: { operation: string; a: number; b: number }) => {
    console.log('🔧 计算器工具被调用:', args);

    let result: number;
    switch (args.operation) {
      case 'add':
        result = args.a + args.b;
        break;
      case 'subtract':
        result = args.a - args.b;
        break;
      case 'multiply':
        result = args.a * args.b;
        break;
      case 'divide':
        if (args.b === 0) {
          throw new Error('除数不能为零');
        }
        result = args.a / args.b;
        break;
      default:
        throw new Error(`不支持的运算类型: ${args.operation}`);
    }

    return {
      operation: args.operation,
      a: args.a,
      b: args.b,
      result: result,
      expression: `${args.a} ${args.operation} ${args.b} = ${result}`
    };
  }
};

// 获取当前时间工具
export const getCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: '获取当前时间',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        description: '时间格式: iso, local, timestamp',
        enum: ['iso', 'local', 'timestamp']
      }
    },
    required: []
  },
  handler: async (args: { format?: string }) => {
    console.log('🔧 获取时间工具被调用:', args);

    const now = new Date();
    let timeString: string;

    switch (args.format) {
      case 'iso':
        timeString = now.toISOString();
        break;
      case 'local':
        timeString = now.toLocaleString();
        break;
      case 'timestamp':
        timeString = now.getTime().toString();
        break;
      default:
        timeString = now.toLocaleString();
    }

    return {
      currentTime: timeString,
      timestamp: now.getTime(),
      format: args.format || 'local'
    };
  }
};

// 示例：如何使用工具调用
async function demonstrateToolCalls() {
  // 创建LLM实例
  const llm = new LLM({
    apiKey: 'your-api-key',
    baseURL: 'your-base-url',
    model: 'your-model'
  });

  // 注册工具
  llm.registerTools([testTool, calculatorTool, getCurrentTimeTool]);

  // 示例对话
  const messages = [
    {
      role: 'user' as const,
      content: [{
        type: 'text' as const,
        text: '请调用测试工具，显示一条消息'
      }]
    }
  ];

  // 启用工具调用
  for await (const result of llm.generate(messages, undefined, undefined, true)) {
    // console.log('🤖 LLM 响应:', {
    //   text: result.text,
    //   hasToolCalls: !!result.toolCalls,
    //   toolCalls: result.toolCalls
    // });

    // 如果检测到工具调用，处理它们
    if (result.toolCalls && result.toolCalls.length > 0) {
      // console.log('🛠️ 检测到工具调用，开始处理...');

      // 处理工具调用并继续对话
      for await (const toolResult of llm.processToolCalls(result.toolCalls, messages, undefined, result.text)) {
        console.log('🔄 工具调用结果:', {
          text: toolResult.text,
          finished: toolResult.finished
        });
      }
    }

    if (result.finished) {
      console.log('✅ 对话完成');
      break;
    }
  }
}

// 导出所有工具
export const defaultTools = [testTool, calculatorTool, getCurrentTimeTool];