import { DingTalkService, CallbackMessage } from "./dingtalk.js";
import { TemplateLoader, InterviewTemplate } from "./templateLoader.js";
import logger from "../utils/logger.js";

interface Question {
  id: string;
  type: "rating" | "text" | "single_choice" | "yes_no";
  text: string;
  follow_ups?: Array<{ id: string; text: string; condition?: string }>;
  condition?: string;
}

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

  constructor(
    dingTalkService: DingTalkService,
    templateLoader: TemplateLoader,
  ) {
    this.dingTalkService = dingTalkService;
    this.templateLoader = templateLoader;
  }

  /**
   * Handle chat messages from DingTalk
   */
  async handleChatMessage(message: CallbackMessage): Promise<void> {
    logger.info({ message }, "Handling chat message");

    // Try to find existing session
    const session = this.getSessionByConversationId(message.conversationId);

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
    const templates = this.templateLoader.listTemplates();
    const defaultTemplate = templates[0]; // Get first template as default

    if (!defaultTemplate) {
      throw new Error("No interview templates available");
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
  async continueInterview(
    session: InterviewSession,
    message: CallbackMessage,
  ): Promise<void> {
    // Record user's answer
    this.recordAnswer(session, message);

    // Send next question or complete interview
    if (this.hasMoreQuestions(session)) {
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
      msgtype: "text",
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
      msgtype: "text",
      text: { content: question.text },
    });

    session.updatedAt = Date.now();
  }

  /**
   * Record user's answer
   */
  private recordAnswer(
    session: InterviewSession,
    message: CallbackMessage,
  ): void {
    const currentQuestion = this.getCurrentQuestion(session);

    if (!currentQuestion) {
      return;
    }

    const answer = message.text?.content || "";
    session.answers[currentQuestion.id] = answer;
    session.updatedAt = Date.now();

    logger.info(
      { questionId: currentQuestion.id, answer },
      `Recorded answer for question`,
    );
  }

  /**
   * Check if there are more questions to ask
   */
  private hasMoreQuestions(session: InterviewSession): boolean {
    return this.getCurrentQuestion(session) !== null;
  }

  /**
   * Complete interview and generate report
   */
  private async completeInterview(session: InterviewSession): Promise<void> {
    const completionMessage = `感谢您完成面试！您的回答已记录。\n\n我们将对您的回答进行分析，稍后会发送面试报告。`;

    await this.dingTalkService.sendToConversation(session.conversationId, {
      msgtype: "text",
      text: { content: completionMessage },
    });

    // Generate interview report (you can implement report generation here)
    this.generateInterviewReport(session);

    // Remove session from active sessions
    this.sessions.delete(session.id);
  }

  /**
   * Generate interview report
   */
  private generateInterviewReport(session: InterviewSession): void {
    logger.info(
      { sessionId: session.id, answers: session.answers },
      "Generating interview report",
    );

    // Implement report generation logic here
    // This could include calling LLM to analyze answers and generate summary
  }

  /**
   * Get current question from session
   */
  private getCurrentQuestion(session: InterviewSession): Question | null {
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
  private getQuestionsForTopic(
    template: InterviewTemplate,
    _topicId: string,
  ): Question[] {
    // In a real implementation, you would map topics to questions
    // For this example, we'll return all questions
    return template.questions as Question[];
  }

  /**
   * Get session by conversation ID
   */
  private getSessionByConversationId(
    conversationId: string,
  ): InterviewSession | undefined {
    return Array.from(this.sessions.values()).find(
      (session) => session.conversationId === conversationId,
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
