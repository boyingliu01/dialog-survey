import { DingTalkService } from './dingtalk';
import { CallbackMessage } from './dingtalk/types';
import { TemplateLoader, InterviewTemplate } from './templateLoader';

// Session state interface
interface InterviewSession {
  id: string;
  userId: string;
  conversationId: string;
  template: InterviewTemplate;
  currentTopicIndex: number;
  currentQuestionIndex: number;
  answers: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

class MessageHandler {
  private dingTalkService: DingTalkService;
  private templateLoader: TemplateLoader;
  private sessions: Map<string, InterviewSession> = new Map();

  constructor(dingTalkService: DingTalkService, templateLoader: TemplateLoader) {
    this.dingTalkService = dingTalkService;
    this.templateLoader = templateLoader;
  }

  /**
   * Handle chat messages from DingTalk
   */
  async handleChatMessage(message: CallbackMessage): Promise<void> {
    console.log('Handling chat message:', message);

    // Try to find existing session
    let session = this.getSessionByConversationId(message.conversationId);

    if (!session) {
      // Start new interview
      await this.startNewInterview(message);
      return;
    }

    // Continue existing interview
    await this.continueInterview(session, message);
  }

  /**
   * Start a new interview
   */
  async startNewInterview(message: CallbackMessage): Promise<InterviewSession> {
    // Load default interview template (you can implement template selection logic here)
    const templates = await this.templateLoader.listTemplates();
    const defaultTemplate = templates[0]; // Get first template as default

    if (!defaultTemplate) {
      throw new Error('No interview templates available');
    }

    // Create new session
    const session: InterviewSession = {
      id: this.generateSessionId(),
      userId: message.senderStaffId,
      conversationId: message.conversationId,
      template: defaultTemplate,
      currentTopicIndex: 0,
      currentQuestionIndex: 0,
      answers: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(session.id, session);

    // Send initial greeting and first question
    await this.sendInitialGreeting(session);
    await this.sendNextQuestion(session);

    return session;
  }

  /**
   * Continue existing interview
   */
  async continueInterview(session: InterviewSession, message: CallbackMessage): Promise<void> {
    // Record user's answer
    await this.recordAnswer(session, message);

    // Send next question or complete interview
    if (await this.hasMoreQuestions(session)) {
      await this.sendNextQuestion(session);
    } else {
      await this.completeInterview(session);
    }
  }

  /**
   * Send initial greeting to user
   */
  private async sendInitialGreeting(session: InterviewSession): Promise<void> {
    const greeting = `您好！欢迎参加 ${session.template.name} 面试。\n\n${session.template.description}\n\n我们将开始进行面试，请认真回答每个问题。`;

    await this.dingTalkService.sendToConversation(session.conversationId, {
      msgtype: 'text',
      text: { content: greeting },
    });
  }

  /**
   * Send next question to user
   */
  private async sendNextQuestion(session: InterviewSession): Promise<void> {
    const question = this.getCurrentQuestion(session);

    if (!question) {
      await this.completeInterview(session);
      return;
    }

    await this.dingTalkService.sendToConversation(session.conversationId, {
      msgtype: 'text',
      text: { content: question.text },
    });

    session.updatedAt = Date.now();
  }

  /**
   * Record user's answer
   */
  private async recordAnswer(session: InterviewSession, message: CallbackMessage): Promise<void> {
    const currentQuestion = this.getCurrentQuestion(session);

    if (!currentQuestion) {
      return;
    }

    const answer = message.text?.content || '';
    session.answers[currentQuestion.id] = answer;
    session.updatedAt = Date.now();

    console.log(`Recorded answer for question ${currentQuestion.id}:`, answer);
  }

  /**
   * Check if there are more questions to ask
   */
  private async hasMoreQuestions(session: InterviewSession): Promise<boolean> {
    return this.getCurrentQuestion(session) !== null;
  }

  /**
   * Complete interview and generate report
   */
  private async completeInterview(session: InterviewSession): Promise<void> {
    const completionMessage = `感谢您完成面试！您的回答已记录。\n\n我们将对您的回答进行分析，稍后会发送面试报告。`;

    await this.dingTalkService.sendToConversation(session.conversationId, {
      msgtype: 'text',
      text: { content: completionMessage },
    });

    // Generate interview report (you can implement report generation here)
    await this.generateInterviewReport(session);

    // Remove session from active sessions
    this.sessions.delete(session.id);
  }

  /**
   * Generate interview report
   */
  private async generateInterviewReport(session: InterviewSession): Promise<void> {
    console.log('Generating interview report for session:', session.id);
    console.log('Answers:', session.answers);

    // Implement report generation logic here
    // This could include calling LLM to analyze answers and generate summary
  }

  /**
   * Get current question from session
   */
  private getCurrentQuestion(session: InterviewSession): any {
    const { currentTopicIndex, currentQuestionIndex, template } = session;

    if (currentTopicIndex >= template.topics.length) {
      return null;
    }

    const topic = template.topics[currentTopicIndex];
    const topicQuestions = this.getQuestionsForTopic(template, topic.id);

    if (currentQuestionIndex >= topicQuestions.length) {
      return null;
    }

    return topicQuestions[currentQuestionIndex];
  }

  /**
   * Get questions for a specific topic
   */
  private getQuestionsForTopic(template: InterviewTemplate, _topicId: string): any[] {
    // In a real implementation, you would map topics to questions
    // For this example, we'll return all questions
    return template.questions;
  }

  /**
   * Get session by conversation ID
   */
  private getSessionByConversationId(conversationId: string): InterviewSession | undefined {
    return Array.from(this.sessions.values()).find(
      (session) => session.conversationId === conversationId
    );
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): InterviewSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by ID
   */
  getSessionById(sessionId: string): InterviewSession | undefined {
    return this.sessions.get(sessionId);
  }
}

export { MessageHandler };
