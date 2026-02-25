import React, { useState } from "react";
import "./App.css";
import { getRegionNames, getServicesByRegion } from "./servicesConfig";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
} from "chart.js";
import { Pie } from "react-chartjs-2";
import { TreemapController, TreemapElement } from "chartjs-chart-treemap";
import { Chart } from "react-chartjs-2";

// Register Chart.js components
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  TreemapController,
  TreemapElement,
);

function App() {
  const apiBaseUrl = (
    process.env.REACT_APP_API_BASE_URL || "http://localhost:5000"
  ).replace(/\/$/, "");
  const apiUrl = (pathname) => `${apiBaseUrl}${pathname}`;

  const analysisExplainers = {
    topFiveSummary:
      "Extracts and summarizes the five most prominent stories visible on the captured front page.",
    socialMediaRewrite:
      "Finds top stories and rewrites headlines into more engaging social copy in English and the target language.",
    updatesFrequency:
      "Reads visible timestamps and groups stories by recency to show how frequently the page is updated.",
    sentimentAnalysis:
      "Classifies visible stories by sentiment and tone, then scores each one for a quick emotional overview.",
    coverageAnalysis:
      "Identifies key themes, highlights strengths and gaps, and compares coverage breadth against likely trends.",
    audienceFitAnalysis:
      "Estimates target audience fit, readability, and complexity, then suggests improvements for stronger alignment.",
  };

  const [selectedRegion, setSelectedRegion] = useState("Latin America");
  const [selectedService, setSelectedService] = useState(
    getServicesByRegion("Latin America")[0],
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // null | 'success' | 'error'
  const [message, setMessage] = useState("");
  const [lastFilename, setLastFilename] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState("");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [askingFollowUp, setAskingFollowUp] = useState(false);

  const handleRegionChange = (region) => {
    setSelectedRegion(region);
    const services = getServicesByRegion(region);
    if (services.length > 0) {
      setSelectedService(services[0]);
    }
  };

  const handleServiceChange = (serviceName) => {
    const services = getServicesByRegion(selectedRegion);
    const service = services.find((s) => s.name === serviceName);
    if (service) {
      setSelectedService(service);
    }
  };

  const handleCapture = async () => {
    setLoading(true);
    setStatus(null);
    setMessage("Capturing screenshot... please wait.");

    // Get service name and URL from selected service
    const serviceName = selectedService.name.replace(/\s+/g, "");
    const serviceUrl = selectedService.url;

    try {
      // Set up a timeout to prevent indefinite hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 130000); // 130s timeout

      const response = await fetch(apiUrl("/api/capture"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: serviceUrl,
          serviceName: serviceName,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage(`Success! Saved as: ${data.filename}`);
        setLastFilename(data.filename);
        setCapturedImageUrl(apiUrl(`/screengrabs/${data.filename}`));
        setSelectedAnalysis("");
        setAnalysis(null); // Clear previous analysis
        setFollowUpQuestion("");
        setFollowUpAnswer("");
      } else {
        setStatus("error");
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus("error");
      if (error.name === "AbortError") {
        setMessage("Request timeout - server may be slow. Check backend logs.");
      } else {
        setMessage("Network error. Is the backend server running?");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAnalysisChange = async (analysisType) => {
    if (!analysisType || !lastFilename) {
      setSelectedAnalysis(analysisType);
      return;
    }

    setSelectedAnalysis(analysisType);
    setAnalyzing(true);
    setAnalysis(null);
    setFollowUpAnswer("");
    setMessage("Analysing content with AI... please wait.");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(apiUrl("/api/analyze"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: lastFilename,
          analysisType: analysisType,
          serviceName: selectedService.name,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage("AI analysis completed!");
        setAnalysis(data.results);
      } else {
        setStatus("error");
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus("error");
      if (error.name === "AbortError") {
        setMessage("Analysis timeout - please try again.");
      } else {
        setMessage("Network error. Is the backend server running?");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFollowUpQuestion = async () => {
    if (!lastFilename || !followUpQuestion.trim()) {
      return;
    }

    setAskingFollowUp(true);
    setStatus(null);
    setFollowUpAnswer("");

    try {
      const response = await fetch(apiUrl("/api/ask-frontpage"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: lastFilename,
          question: followUpQuestion.trim(),
          serviceName: selectedService.name,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to get response.";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Ignore parse error and keep default
        }
        setStatus("error");
        setMessage(`Error: ${errorMessage}`);
        return;
      }

      if (!response.body) {
        setStatus("error");
        setMessage("No streamed response received.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        if (chunkText) {
          setFollowUpAnswer((previous) => previous + chunkText);
        }
      }

      setStatus("success");
      setMessage("Follow-up answer complete.");
    } catch (error) {
      setStatus("error");
      setMessage("Network error while asking follow-up question.");
    } finally {
      setAskingFollowUp(false);
    }
  };

  const handleFollowUpKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (
        !loading &&
        !analyzing &&
        !askingFollowUp &&
        followUpQuestion.trim()
      ) {
        handleFollowUpQuestion();
      }
    }
  };

  return (
    <div className="app-container">
      <div className="dashboard-card">
        <h1>🤖 AI Front Page Tracker</h1>

        <div className="controls-container">
          <div className="control-group">
            <label>Select region:</label>
            <select
              value={selectedRegion}
              onChange={(e) => handleRegionChange(e.target.value)}
              disabled={loading || analyzing}
            >
              {getRegionNames().map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Select language service:</label>
            <select
              value={selectedService.name}
              onChange={(e) => handleServiceChange(e.target.value)}
              disabled={loading || analyzing}
            >
              {getServicesByRegion(selectedRegion).map((service) => (
                <option key={service.url} value={service.name}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="capture-btn"
          onClick={handleCapture}
          disabled={loading || analyzing}
        >
          {loading ? "Capturing..." : "Capture front page"}
        </button>

        {capturedImageUrl && (
          <>
            <div className="image-preview-container">
              <img
                src={capturedImageUrl}
                alt="Captured screenshot"
                className="captured-image-preview"
              />
              <div className="image-fade-overlay"></div>
            </div>

            <div className="analysis-selection">
              <label htmlFor="analysis-dropdown">
                <h3>Choose analysis:</h3>
              </label>
              <select
                id="analysis-dropdown"
                value={selectedAnalysis}
                onChange={(e) => handleAnalysisChange(e.target.value)}
                disabled={loading || analyzing}
                className="analysis-dropdown"
              >
                <option value="">-- Select an analysis type --</option>
                <option value="topFiveSummary">Top 5 summary</option>
                <option value="socialMediaRewrite">
                  Rewrite for social media
                </option>
                <option value="updatesFrequency">Updates frequency</option>
                <option value="sentimentAnalysis">Sentiment analysis</option>
                <option value="coverageAnalysis">Coverage quality</option>
                <option value="audienceFitAnalysis">Audience fit</option>
              </select>
              {selectedAnalysis && analysisExplainers[selectedAnalysis] && (
                <p className="analysis-explainer analysis-selection-explainer">
                  {analysisExplainers[selectedAnalysis]}
                </p>
              )}
            </div>
          </>
        )}

        {message && <div className={`status-message ${status}`}>{message}</div>}

        {analysis && (
          <div className="analysis-result">
            <h2>📰 AI Analysis</h2>

            {analysis.topFiveSummary && (
              <div className="analysis-section">
                <h3 className="analysis-section-title">Top 5 Summary</h3>
                <p className="analysis-explainer">
                  {analysisExplainers.topFiveSummary}
                </p>
                <div className="analysis-content">
                  {analysis.topFiveSummary
                    .split("\n")
                    .map((line, index, array) => {
                      const trimmedLine = line.trim();

                      // Check if line is an article marker (starts with **Article)
                      if (trimmedLine.startsWith("**Article")) {
                        const cleanTitle = line.replace(/\*\*/g, "").trim();
                        return (
                          <h3 key={index} className="article-marker">
                            {cleanTitle}
                          </h3>
                        );
                      }

                      // Check if line is bold text (wrapped in **)
                      if (
                        trimmedLine.startsWith("**") &&
                        trimmedLine.endsWith("**")
                      ) {
                        const cleanTitle = line.replace(/\*\*/g, "").trim();
                        return (
                          <h3 key={index} className="article-title">
                            {cleanTitle}
                          </h3>
                        );
                      }

                      // Check if this is a headline (first non-empty line after "**Article N:**")
                      const prevLine = index > 0 ? array[index - 1].trim() : "";
                      if (
                        prevLine.startsWith("**Article") &&
                        trimmedLine &&
                        !trimmedLine.startsWith("**")
                      ) {
                        return (
                          <h3 key={index} className="article-title">
                            {line}
                          </h3>
                        );
                      }

                      // Regular paragraph or empty line
                      return trimmedLine ? (
                        <p key={index}>{line}</p>
                      ) : (
                        <br key={index} />
                      );
                    })}
                </div>
              </div>
            )}

            {analysis.socialMediaRewrite &&
              Array.isArray(analysis.socialMediaRewrite) && (
                <div className="analysis-section">
                  <h3 className="analysis-section-title">
                    Social media optimised headlines
                  </h3>
                  <p className="analysis-explainer">
                    {analysisExplainers.socialMediaRewrite}
                  </p>
                  <div className="analysis-content">
                    {analysis.socialMediaRewrite.map((article, index) => (
                      <div key={index} className="social-media-article">
                        <div className="article-number">
                          Article {index + 1}
                        </div>
                        <div className="original-headline">
                          <strong>Original:</strong> {article.originalHeadline}
                        </div>
                        <div className="social-media-rewrites">
                          <div className="rewrite-item english">
                            <span className="language-badge">🇬🇧 English</span>
                            <p>{article.socialMediaEnglish}</p>
                          </div>
                          <div className="rewrite-item target">
                            <span className="language-badge">
                              🌍 {article.targetLanguage}
                            </span>
                            <p>{article.socialMediaTarget}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {analysis.updatesFrequency && (
              <div className="analysis-section">
                <h3 className="analysis-section-title">Updates frequency</h3>
                <p className="analysis-explainer">
                  {analysisExplainers.updatesFrequency}
                </p>
                <div className="analysis-content">
                  <div className="chart-container">
                    <Pie
                      key="updates-frequency-pie"
                      data={{
                        labels: [
                          "Under 1 hour",
                          "Under 4 hours",
                          "Today",
                          "Yesterday",
                          "Older",
                        ],
                        datasets: [
                          {
                            label: "Number of Articles",
                            data: [
                              analysis.updatesFrequency.underOneHour,
                              analysis.updatesFrequency.underFourHours,
                              analysis.updatesFrequency.today,
                              analysis.updatesFrequency.yesterday,
                              analysis.updatesFrequency.older,
                            ],
                            backgroundColor: [
                              "#4caf50", // Green for under 1 hour
                              "#8bc34a", // Light green for under 4 hours
                              "#ffeb3b", // Yellow for today
                              "#ff9800", // Orange for yesterday
                              "#f44336", // Red for older
                            ],
                            borderColor: [
                              "#388e3c",
                              "#689f38",
                              "#fbc02d",
                              "#f57c00",
                              "#d32f2f",
                            ],
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                          legend: {
                            position: "bottom",
                            labels: {
                              padding: 15,
                              font: {
                                family:
                                  "Georgia, 'Times New Roman', Times, serif",
                                size: 14,
                              },
                            },
                          },
                          tooltip: {
                            callbacks: {
                              label: function (context) {
                                const label = context.label || "";
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce(
                                  (a, b) => a + b,
                                  0,
                                );
                                const percentage = (
                                  (value / total) *
                                  100
                                ).toFixed(1);
                                return `${label}: ${value} articles (${percentage}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {analysis.sentimentAnalysis &&
              Array.isArray(analysis.sentimentAnalysis) &&
              analysis.sentimentAnalysis.length > 0 && (
                <div className="analysis-section">
                  <h3 className="analysis-section-title">Sentiment analysis</h3>
                  <p className="analysis-explainer">
                    {analysisExplainers.sentimentAnalysis}
                  </p>
                  <div className="analysis-content">
                    <div
                      className="chart-container"
                      style={{ height: "500px" }}
                    >
                      <Chart
                        key="sentiment-treemap"
                        type="treemap"
                        data={{
                          datasets: [
                            {
                              label: "Article Sentiment",
                              tree: analysis.sentimentAnalysis,
                              key: "score",
                              spacing: 0.5,
                              borderWidth: 1.5,
                              borderColor: "white",
                              captions: {
                                display: false,
                              },
                              labels: {
                                display: true,
                                align: "left",
                                position: "top",
                                color: "white",
                                font: {
                                  family:
                                    "Georgia, 'Times New Roman', Times, serif",
                                  size: 10,
                                  weight: "bold",
                                },
                                formatter: (ctx) => {
                                  if (!ctx || !ctx.raw) return "";
                                  const data = ctx.raw._data || ctx.raw;
                                  if (!data || !data.headline) return "";
                                  const headline = data.headline;
                                  const sentiment = data.sentiment || "";
                                  // Truncate long headlines
                                  const maxLength = 30;
                                  const truncated =
                                    headline.length > maxLength
                                      ? headline.substring(0, maxLength) + "..."
                                      : headline;
                                  return `${truncated}\n(${sentiment})`;
                                },
                                overflow: "hidden",
                              },
                              backgroundColor: (ctx) => {
                                if (!ctx || !ctx.raw)
                                  return "rgba(158, 158, 158, 0.9)";
                                const data = ctx.raw._data || ctx.raw;
                                if (!data) return "rgba(158, 158, 158, 0.9)";

                                const sentiment = data.sentiment;
                                const score = data.score || 5;

                                // Color based on sentiment with intensity based on score
                                if (sentiment === "Positive") {
                                  const intensity = Math.min(
                                    255,
                                    100 + score * 15,
                                  );
                                  return `rgba(76, ${intensity}, 80, 0.9)`;
                                } else if (sentiment === "Negative") {
                                  const intensity = Math.min(
                                    255,
                                    100 + (10 - score) * 15,
                                  );
                                  return `rgba(${intensity}, 68, 68, 0.9)`;
                                } else if (sentiment === "Mixed") {
                                  return "rgba(255, 152, 0, 0.9)";
                                } else {
                                  return "rgba(158, 158, 158, 0.9)";
                                }
                              },
                              hoverBackgroundColor: (ctx) => {
                                if (!ctx || !ctx.raw)
                                  return "rgba(158, 158, 158, 1)";
                                const data = ctx.raw._data || ctx.raw;
                                if (!data) return "rgba(158, 158, 158, 1)";

                                const sentiment = data.sentiment;
                                const score = data.score || 5;

                                if (sentiment === "Positive") {
                                  const intensity = Math.min(
                                    255,
                                    100 + score * 15,
                                  );
                                  return `rgba(76, ${intensity}, 80, 1)`;
                                } else if (sentiment === "Negative") {
                                  const intensity = Math.min(
                                    255,
                                    100 + (10 - score) * 15,
                                  );
                                  return `rgba(${intensity}, 68, 68, 1)`;
                                } else if (sentiment === "Mixed") {
                                  return "rgba(255, 152, 0, 1)";
                                } else {
                                  return "rgba(158, 158, 158, 1)";
                                }
                              },
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            title: {
                              display: false,
                            },
                            legend: {
                              display: false,
                            },
                            tooltip: {
                              displayColors: false,
                              callbacks: {
                                title: (context) => {
                                  if (
                                    !context ||
                                    !context[0] ||
                                    !context[0].raw
                                  )
                                    return "";
                                  const data =
                                    context[0].raw._data || context[0].raw;
                                  return data?.headline || "";
                                },
                                label: (context) => {
                                  if (!context || !context.raw) return "";
                                  const data = context.raw._data || context.raw;
                                  const sentiment =
                                    data?.sentiment || "Unknown";
                                  const score = data?.score || 0;
                                  return [
                                    `Sentiment: ${sentiment}`,
                                    `Score: ${score}/10`,
                                  ];
                                },
                              },
                            },
                          },
                        }}
                      />
                    </div>
                    <div className="sentiment-legend">
                      <div className="legend-item">
                        <span className="legend-color positive"></span>
                        <span>Positive</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color neutral"></span>
                        <span>Neutral</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color mixed"></span>
                        <span>Mixed</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color negative"></span>
                        <span>Negative</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {analysis.coverageAnalysis && (
              <div className="analysis-section">
                <h3 className="analysis-section-title">
                  Coverage Quality Analysis
                </h3>
                <p className="analysis-explainer">
                  {analysisExplainers.coverageAnalysis}
                </p>
                <div className="analysis-content">
                  <div className="coverage-section">
                    <h4>📋 Main Themes Covered</h4>
                    <ul>
                      {analysis.coverageAnalysis.mainThemes.map(
                        (theme, index) => (
                          <li key={index}>{theme}</li>
                        ),
                      )}
                    </ul>
                  </div>

                  <div className="coverage-section">
                    <h4>✅ Coverage Strengths</h4>
                    <ul>
                      {analysis.coverageAnalysis.coverageStrengths.map(
                        (strength, index) => (
                          <li key={index} className="strength-item">
                            {strength}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>

                  <div className="coverage-section">
                    <h4>⚠️ Coverage Gaps</h4>
                    <ul>
                      {analysis.coverageAnalysis.coverageGaps.map(
                        (gap, index) => (
                          <li key={index} className="gap-item">
                            {gap}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>

                  <div className="coverage-section">
                    <h4>🔥 Trending Topics Missing</h4>
                    <ul>
                      {analysis.coverageAnalysis.trendingMissing.map(
                        (topic, index) => (
                          <li key={index} className="missing-item">
                            {topic}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>

                  <div className="coverage-section overall-assessment">
                    <h4>📊 Overall Assessment</h4>
                    <p>{analysis.coverageAnalysis.overallAssessment}</p>
                  </div>
                </div>
              </div>
            )}

            {analysis.audienceFitAnalysis && (
              <div className="analysis-section">
                <h3 className="analysis-section-title">Audience Fit Analysis</h3>
                <p className="analysis-explainer">
                  {analysisExplainers.audienceFitAnalysis}
                </p>
                <div className="analysis-content">
                  <div className="coverage-section">
                    <h4>👥 Audience Profile</h4>
                    <ul>
                      <li>
                        <strong>Primary audience:</strong>{" "}
                        {analysis.audienceFitAnalysis.primaryAudience}
                      </li>
                      <li>
                        <strong>Readability level:</strong>{" "}
                        {analysis.audienceFitAnalysis.readabilityLevel}
                      </li>
                      <li>
                        <strong>Complexity level:</strong>{" "}
                        {analysis.audienceFitAnalysis.complexityLevel}
                      </li>
                      <li>
                        <strong>Audience fit score:</strong>{" "}
                        {analysis.audienceFitAnalysis.audienceFitScore}/100
                      </li>
                    </ul>
                  </div>

                  <div className="coverage-section">
                    <h4>✅ Fit Strengths</h4>
                    <ul>
                      {analysis.audienceFitAnalysis.fitStrengths.map(
                        (strength, index) => (
                          <li key={index} className="strength-item">
                            {strength}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>

                  <div className="coverage-section">
                    <h4>⚠️ Fit Gaps</h4>
                    <ul>
                      {analysis.audienceFitAnalysis.fitGaps.map((gap, index) => (
                        <li key={index} className="gap-item">
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="coverage-section">
                    <h4>🛠 Recommendations</h4>
                    <ul>
                      {analysis.audienceFitAnalysis.recommendations.map(
                        (recommendation, index) => (
                          <li key={index}>{recommendation}</li>
                        ),
                      )}
                    </ul>
                  </div>

                  <div className="coverage-section overall-assessment">
                    <h4>📊 Overall Assessment</h4>
                    <p>{analysis.audienceFitAnalysis.overallAssessment}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="follow-up-panel">
              <h3 className="follow-up-title">
                Ask anything else about this front page?
              </h3>
              <p className="follow-up-subtitle">
                Ask a custom question and watch the answer appear progressively
                as AI generates it.
              </p>
              <div className="follow-up-content">
                <textarea
                  className="follow-up-textarea"
                  value={followUpQuestion}
                  onChange={(e) => setFollowUpQuestion(e.target.value)}
                  onKeyDown={handleFollowUpKeyDown}
                  placeholder="Example: What is the most prominent political story and why?"
                  rows={3}
                  disabled={loading || analyzing || askingFollowUp}
                />
                <button
                  className="follow-up-btn"
                  onClick={handleFollowUpQuestion}
                  disabled={
                    loading ||
                    analyzing ||
                    askingFollowUp ||
                    !followUpQuestion.trim()
                  }
                >
                  {askingFollowUp ? "Generating answer..." : "Ask AI"}
                </button>

                {(askingFollowUp || followUpAnswer) && (
                  <div className="follow-up-answer">
                    {followUpAnswer || "Generating answer..."}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
