"""
Tests for analysis models.

TDD approach: Tests written BEFORE implementation.
"""

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.models.database import Base
from src.models.interview import Interview, InterviewStatus
from src.models.message import Message
from src.models.analysis import (
    AnalysisJob,
    AnalysisJobStatus,
    AnalysisTopic,
    KeyPoint,
    AnalysisResult,
)

# Use in-memory SQLite for testing
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db_session():
    """Create a test database session."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def sample_interview(db_session):
    """Create a sample interview for testing."""
    interview = Interview(
        session_id="analysis_test_session",
        user_id="test_user",
        template_id="quality_survey",
        topic="质量满意度调查",
        status=InterviewStatus.COMPLETED,
    )
    db_session.add(interview)
    db_session.commit()
    return interview


class TestAnalysisJobModel:
    """Tests for AnalysisJob model."""

    def test_create_analysis_job(self, db_session):
        """Test creating an analysis job."""
        job = AnalysisJob(
            total_interviews=10,
        )
        db_session.add(job)
        db_session.commit()

        assert job.id is not None
        assert job.status == AnalysisJobStatus.PENDING
        assert job.total_interviews == 10
        assert job.processed_count == 0
        assert job.created_at is not None

    def test_analysis_job_status_transitions(self, db_session):
        """Test analysis job status transitions: pending/running/completed/failed."""
        job = AnalysisJob(total_interviews=5)
        db_session.add(job)
        db_session.commit()

        # Initial status is pending
        assert job.status == AnalysisJobStatus.PENDING

        # Transition to running
        job.status = AnalysisJobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db_session.commit()
        assert job.status == AnalysisJobStatus.RUNNING
        assert job.started_at is not None

        # Transition to completed
        job.status = AnalysisJobStatus.COMPLETED
        job.completed_at = datetime.utcnow()
        job.processed_count = 5
        db_session.commit()
        assert job.status == AnalysisJobStatus.COMPLETED
        assert job.completed_at is not None
        assert job.processed_count == 5

    def test_analysis_job_failed_status(self, db_session):
        """Test analysis job failure status with error message."""
        job = AnalysisJob(total_interviews=3)
        db_session.add(job)
        db_session.commit()

        # Transition to running then failed
        job.status = AnalysisJobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db_session.commit()

        job.status = AnalysisJobStatus.FAILED
        job.error_message = "LLM API timeout error"
        db_session.commit()

        assert job.status == AnalysisJobStatus.FAILED
        assert job.error_message == "LLM API timeout error"

    def test_analysis_job_with_plan_id(self, db_session):
        """Test analysis job with optional plan_id."""
        job = AnalysisJob(
            plan_id=1,  # Can be null, testing with a value
            total_interviews=8,
        )
        db_session.add(job)
        db_session.commit()

        assert job.plan_id == 1

    def test_analysis_job_nullable_fields(self, db_session):
        """Test analysis job with nullable fields."""
        job = AnalysisJob(total_interviews=0)
        db_session.add(job)
        db_session.commit()

        assert job.plan_id is None
        assert job.started_at is None
        assert job.completed_at is None
        assert job.error_message is None


class TestAnalysisTopicModel:
    """Tests for AnalysisTopic model."""

    def test_create_analysis_topic(self, db_session):
        """Test creating an analysis topic with mention count and rates."""
        job = AnalysisJob(total_interviews=10)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(
            job_id=job.id,
            name="产品质量",
            keywords=["质量", "产品", "耐用"],
            mention_count=15,
            mention_rate=0.75,
            positive_ratio=0.6,
            negative_ratio=0.2,
            neutral_ratio=0.2,
        )
        db_session.add(topic)
        db_session.commit()

        assert topic.id is not None
        assert topic.name == "产品质量"
        assert topic.keywords == ["质量", "产品", "耐用"]
        assert topic.mention_count == 15
        assert topic.mention_rate == 0.75
        assert topic.positive_ratio == 0.6
        assert topic.negative_ratio == 0.2
        assert topic.neutral_ratio == 0.2

    def test_analysis_topic_defaults(self, db_session):
        """Test analysis topic default values."""
        job = AnalysisJob(total_interviews=5)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(
            job_id=job.id,
            name="服务态度",
        )
        db_session.add(topic)
        db_session.commit()

        assert topic.mention_count == 0
        assert topic.mention_rate == 0.0
        assert topic.positive_ratio == 0.0
        assert topic.negative_ratio == 0.0
        assert topic.neutral_ratio == 0.0
        assert topic.keywords is None  # JSON column can be None

    def test_analysis_topic_keywords_json(self, db_session):
        """Test analysis topic keywords stored as JSON."""
        job = AnalysisJob(total_interviews=3)
        db_session.add(job)
        db_session.commit()

        keywords_list = ["价格", "性价比", "便宜", "贵"]
        topic = AnalysisTopic(
            job_id=job.id,
            name="价格",
            keywords=keywords_list,
        )
        db_session.add(topic)
        db_session.commit()

        # Query back and verify JSON serialization
        result = db_session.query(AnalysisTopic).filter_by(name="价格").first()
        assert result.keywords == keywords_list
        assert isinstance(result.keywords, list)


class TestKeyPointModel:
    """Tests for KeyPoint model."""

    def test_create_key_point(self, db_session, sample_interview):
        """Test creating a key point with quote and sentiment."""
        job = AnalysisJob(total_interviews=1)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(
            job_id=job.id,
            name="产品质量",
        )
        db_session.add(topic)
        db_session.commit()

        key_point = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="用户对产品耐用性表示满意",
            quote="这个产品用了三年还没坏，质量确实不错",
            sentiment="positive",
            interviewee_role="老客户",
        )
        db_session.add(key_point)
        db_session.commit()

        assert key_point.id is not None
        assert key_point.summary == "用户对产品耐用性表示满意"
        assert key_point.quote == "这个产品用了三年还没坏，质量确实不错"
        assert key_point.sentiment == "positive"
        assert key_point.interviewee_role == "老客户"

    def test_key_point_sentiment_values(self, db_session, sample_interview):
        """Test key point with different sentiment values."""
        job = AnalysisJob(total_interviews=1)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(job_id=job.id, name="价格")
        db_session.add(topic)
        db_session.commit()

        # Test positive sentiment
        kp_positive = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="价格合理",
            quote="价格适中，性价比高",
            sentiment="positive",
        )
        db_session.add(kp_positive)

        # Test negative sentiment
        kp_negative = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="价格偏高",
            quote="有点贵，不太划算",
            sentiment="negative",
        )
        db_session.add(kp_negative)

        # Test neutral sentiment
        kp_neutral = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="价格一般",
            quote="价格还行，没什么特别的",
            sentiment="neutral",
        )
        db_session.add(kp_neutral)

        db_session.commit()

        results = db_session.query(KeyPoint).filter_by(topic_id=topic.id).all()
        assert len(results) == 3
        sentiments = [r.sentiment for r in results]
        assert "positive" in sentiments
        assert "negative" in sentiments
        assert "neutral" in sentiments

    def test_key_point_nullable_fields(self, db_session, sample_interview):
        """Test key point nullable fields."""
        job = AnalysisJob(total_interviews=1)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(job_id=job.id, name="服务")
        db_session.add(topic)
        db_session.commit()

        key_point = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="简短总结",
            quote="原话引用",
            sentiment="neutral",
        )
        db_session.add(key_point)
        db_session.commit()

        assert key_point.interviewee_role is None


class TestAnalysisResultModel:
    """Tests for AnalysisResult model."""

    def test_create_analysis_result(self, db_session):
        """Test creating an analysis result with sentiment distribution."""
        job = AnalysisJob(total_interviews=10)
        db_session.add(job)
        db_session.commit()

        result = AnalysisResult(
            job_id=job.id,
            total_interviews=10,
            overall_sentiment={
                "positive": 0.6,
                "negative": 0.2,
                "neutral": 0.2,
            },
            top_topics=["产品质量", "服务态度", "价格"],
            satisfaction_score=4.2,
            report_path="reports/job_001/report_20260329.md",
        )
        db_session.add(result)
        db_session.commit()

        assert result.id is not None
        assert result.job_id == job.id
        assert result.total_interviews == 10
        assert result.overall_sentiment["positive"] == 0.6
        assert result.top_topics == ["产品质量", "服务态度", "价格"]
        assert result.satisfaction_score == 4.2
        assert result.report_path == "reports/job_001/report_20260329.md"

    def test_analysis_result_json_fields(self, db_session):
        """Test analysis result JSON fields serialization."""
        job = AnalysisJob(total_interviews=5)
        db_session.add(job)
        db_session.commit()

        sentiment_data = {
            "positive": 0.45,
            "negative": 0.35,
            "neutral": 0.20,
            "details": {
                "very_positive": 0.15,
                "somewhat_positive": 0.30,
            },
        }

        result = AnalysisResult(
            job_id=job.id,
            total_interviews=5,
            overall_sentiment=sentiment_data,
            top_topics=["topic1", "topic2"],
        )
        db_session.add(result)
        db_session.commit()

        # Query back
        queried = db_session.query(AnalysisResult).filter_by(job_id=job.id).first()
        assert queried.overall_sentiment == sentiment_data
        assert queried.overall_sentiment["details"]["very_positive"] == 0.15

    def test_analysis_result_nullable_fields(self, db_session):
        """Test analysis result nullable fields."""
        job = AnalysisJob(total_interviews=3)
        db_session.add(job)
        db_session.commit()

        result = AnalysisResult(
            job_id=job.id,
            total_interviews=3,
        )
        db_session.add(result)
        db_session.commit()

        assert result.overall_sentiment is None
        assert result.top_topics is None
        assert result.satisfaction_score is None
        assert result.report_path is None


class TestAnalysisJobTopicRelationship:
    """Tests for AnalysisJob-AnalysisTopic relationship."""

    def test_job_has_many_topics(self, db_session):
        """Test that an analysis job can have many topics."""
        job = AnalysisJob(total_interviews=10)
        db_session.add(job)
        db_session.commit()

        # Create multiple topics for the job
        topic1 = AnalysisTopic(job_id=job.id, name="产品质量")
        topic2 = AnalysisTopic(job_id=job.id, name="服务态度")
        topic3 = AnalysisTopic(job_id=job.id, name="价格")

        db_session.add_all([topic1, topic2, topic3])
        db_session.commit()

        # Query job and check topics relationship
        queried_job = db_session.query(AnalysisJob).filter_by(id=job.id).first()
        assert len(queried_job.topic_records) == 3
        topic_names = [t.name for t in queried_job.topic_records]
        assert "产品质量" in topic_names
        assert "服务态度" in topic_names
        assert "价格" in topic_names

    def test_topic_belongs_to_job(self, db_session):
        """Test that a topic belongs to a job."""
        job = AnalysisJob(total_interviews=5)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(job_id=job.id, name="交付速度")
        db_session.add(topic)
        db_session.commit()

        # Query topic and check job relationship
        queried_topic = db_session.query(AnalysisTopic).filter_by(id=topic.id).first()
        assert queried_topic.job is not None
        assert queried_topic.job.id == job.id
        assert queried_topic.job.total_interviews == 5


class TestAnalysisTopicKeyPointRelationship:
    """Tests for AnalysisTopic-KeyPoint relationship."""

    def test_topic_has_many_key_points(self, db_session, sample_interview):
        """Test that a topic can have many key points."""
        job = AnalysisJob(total_interviews=1)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(job_id=job.id, name="产品质量")
        db_session.add(topic)
        db_session.commit()

        # Create multiple key points for the topic
        kp1 = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="耐用性好",
            quote="用了三年没坏",
            sentiment="positive",
        )
        kp2 = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="做工精细",
            quote="细节处理很好",
            sentiment="positive",
        )
        kp3 = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="材质一般",
            quote="材料感觉不够好",
            sentiment="neutral",
        )

        db_session.add_all([kp1, kp2, kp3])
        db_session.commit()

        # Query topic and check key_points relationship
        queried_topic = db_session.query(AnalysisTopic).filter_by(id=topic.id).first()
        assert len(queried_topic.key_points) == 3

    def test_key_point_belongs_to_topic(self, db_session, sample_interview):
        """Test that a key point belongs to a topic."""
        job = AnalysisJob(total_interviews=1)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(job_id=job.id, name="服务")
        db_session.add(topic)
        db_session.commit()

        key_point = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="响应及时",
            quote="客服回复很快",
            sentiment="positive",
        )
        db_session.add(key_point)
        db_session.commit()

        # Query key point and check topic relationship
        queried_kp = db_session.query(KeyPoint).filter_by(id=key_point.id).first()
        assert queried_kp.topic is not None
        assert queried_kp.topic.id == topic.id
        assert queried_kp.topic.name == "服务"


class TestAnalysisJobResultRelationship:
    """Tests for AnalysisJob-AnalysisResult relationship."""

    def test_job_has_results(self, db_session):
        """Test that an analysis job can have results."""
        job = AnalysisJob(total_interviews=10)
        db_session.add(job)
        db_session.commit()

        result = AnalysisResult(
            job_id=job.id,
            total_interviews=10,
            satisfaction_score=4.5,
        )
        db_session.add(result)
        db_session.commit()

        # Query job and check results relationship
        queried_job = db_session.query(AnalysisJob).filter_by(id=job.id).first()
        assert len(queried_job.results) == 1
        assert queried_job.results[0].satisfaction_score == 4.5

    def test_result_belongs_to_job(self, db_session):
        """Test that a result belongs to a job."""
        job = AnalysisJob(total_interviews=8)
        db_session.add(job)
        db_session.commit()

        result = AnalysisResult(
            job_id=job.id,
            total_interviews=8,
            top_topics=["质量", "服务"],
        )
        db_session.add(result)
        db_session.commit()

        # Query result and check job relationship
        queried_result = db_session.query(AnalysisResult).filter_by(id=result.id).first()
        assert queried_result.job is not None
        assert queried_result.job.id == job.id


class TestKeyPointInterviewRelationship:
    """Tests for KeyPoint-Interview relationship."""

    def test_key_point_belongs_to_interview(self, db_session, sample_interview):
        """Test that a key point belongs to an interview."""
        job = AnalysisJob(total_interviews=1)
        db_session.add(job)
        db_session.commit()

        topic = AnalysisTopic(job_id=job.id, name="产品质量")
        db_session.add(topic)
        db_session.commit()

        key_point = KeyPoint(
            topic_id=topic.id,
            interview_id=sample_interview.id,
            summary="用户反馈",
            quote="具体内容",
            sentiment="positive",
        )
        db_session.add(key_point)
        db_session.commit()

        # Query key point and check interview relationship
        queried_kp = db_session.query(KeyPoint).filter_by(id=key_point.id).first()
        assert queried_kp.interview is not None
        assert queried_kp.interview.id == sample_interview.id
        assert queried_kp.interview.session_id == "analysis_test_session"
