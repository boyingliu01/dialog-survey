"""Analysis models for statistical analysis data.

Models:
    - AnalysisJob: Analysis task/job tracking
    - AnalysisJobStatus: Analysis job status enum
    - AnalysisTopic: Topic analysis results
    - KeyPoint: Key points extracted from interviews
    - AnalysisResult: Analysis result summary
"""

import enum
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from src.models.database import Base


class AnalysisJobStatus(enum.Enum):
    """Analysis job status enum."""

    PENDING = "pending"
    RUNNING = "running"  # Alias for PROCESSING
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisJob(Base):
    """分析任务表 - Tracks analysis job execution."""

    __tablename__ = "analysis_jobs"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("interview_plans.id"), nullable=True)
    status = Column(SQLEnum(AnalysisJobStatus), default=AnalysisJobStatus.PENDING)
    interview_ids = Column(JSON, nullable=True)  # List of interview session IDs to analyze
    total_interviews = Column(Integer, default=0)
    processed_count = Column(Integer, default=0)
    topics_data = Column(JSON, nullable=True)  # Topic analysis results (JSON data)
    sentiment = Column(JSON, nullable=True)  # Sentiment analysis results
    key_points_data = Column(JSON, nullable=True)  # Key points extracted (JSON data)
    satisfaction_score = Column(Integer, nullable=True)  # Overall satisfaction score
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    topic_records = relationship("AnalysisTopic", back_populates="job", cascade="all, delete-orphan")
    results = relationship("AnalysisResult", back_populates="job", cascade="all, delete-orphan")

    # Property aliases for API compatibility
    @property
    def topics(self):
        return self.topics_data

    @topics.setter
    def topics(self, value) -> None:
        self.topics_data = value

    @property
    def key_points(self):
        return self.key_points_data

    @key_points.setter
    def key_points(self, value) -> None:
        self.key_points_data = value

    def __repr__(self) -> str:
        return f"<AnalysisJob(id={self.id}, status={self.status.value}, total={self.total_interviews})>"


class AnalysisTopic(Base):
    """分析主题表 - Topic-level analysis results."""

    __tablename__ = "analysis_topics"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("analysis_jobs.id"), nullable=False)
    name = Column(String(255), nullable=False)
    keywords = Column(JSON, nullable=True)  # List of keywords for the topic
    mention_count = Column(Integer, default=0)  # Number of mentions
    mention_rate = Column(Float, default=0.0)  # Percentage of interviews mentioning
    positive_ratio = Column(Float, default=0.0)  # Positive sentiment ratio
    negative_ratio = Column(Float, default=0.0)  # Negative sentiment ratio
    neutral_ratio = Column(Float, default=0.0)  # Neutral sentiment ratio
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    job = relationship("AnalysisJob", back_populates="topic_records")
    key_points = relationship("KeyPoint", back_populates="topic", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<AnalysisTopic(id={self.id}, name={self.name}, mentions={self.mention_count})>"


class KeyPoint(Base):
    """关键观点表 - Key points extracted from interviews."""

    __tablename__ = "key_points"

    id = Column(Integer, primary_key=True, index=True)
    topic_id = Column(Integer, ForeignKey("analysis_topics.id"), nullable=False)
    interview_id = Column(Integer, ForeignKey("interviews.id"), nullable=False)
    summary = Column(Text, nullable=False)  # Summary of the key point
    quote = Column(Text, nullable=False)  # Original quote from interviewee
    sentiment = Column(String(20), nullable=False)  # "positive", "negative", or "neutral"
    interviewee_role = Column(String(100), nullable=True)  # Role of the interviewee
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    topic = relationship("AnalysisTopic", back_populates="key_points")
    interview = relationship("Interview")

    def __repr__(self) -> str:
        return f"<KeyPoint(id={self.id}, sentiment={self.sentiment}, topic_id={self.topic_id})>"


class AnalysisResult(Base):
    """分析结果汇总表 - Overall analysis result summary."""

    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("analysis_jobs.id"), nullable=False)
    total_interviews = Column(Integer, default=0)
    overall_sentiment = Column(JSON, nullable=True)  # Dict with sentiment distribution
    top_topics = Column(JSON, nullable=True)  # List of top topics
    satisfaction_score = Column(Float, nullable=True)  # Overall satisfaction score (1-5)
    report_path = Column(String(255), nullable=True)  # Path to generated report
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    job = relationship("AnalysisJob", back_populates="results")

    def __repr__(self) -> str:
        return f"<AnalysisResult(id={self.id}, job_id={self.job_id}, score={self.satisfaction_score})>"
