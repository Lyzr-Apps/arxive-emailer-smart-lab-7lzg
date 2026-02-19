'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { callAIAgent, extractText } from '@/lib/aiAgent'
import { getSchedule, getScheduleLogs, pauseSchedule, resumeSchedule, triggerScheduleNow, cronToHuman, listSchedules } from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FiGrid, FiBookOpen, FiSettings, FiClock, FiPlus, FiTrash2, FiEdit2, FiCheck, FiX, FiExternalLink, FiPlay, FiPause, FiRefreshCw, FiSearch, FiChevronDown, FiChevronUp, FiMenu, FiMail, FiFileText, FiZap, FiActivity, FiAlertCircle, FiCheckCircle, FiLoader, FiCalendar } from 'react-icons/fi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANAGER_AGENT_ID = '69978cc371b7a9a008a12b35'
const ARXIV_AGENT_ID = '69978565c1ac1837f449f43b'
const EMAIL_AGENT_ID = '69978564c1ac1837f449f439'
const SCHEDULE_ID = '69978ccd399dfadeac37bdea'

const AGENTS = [
  { id: MANAGER_AGENT_ID, name: 'Research Digest Manager', role: 'Orchestrates the weekly pipeline' },
  { id: ARXIV_AGENT_ID, name: 'ArXiv Research Agent', role: 'Searches ArXiv for papers' },
  { id: EMAIL_AGENT_ID, name: 'Email Digest Agent', role: 'Composes and sends digest emails' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestEntry {
  id: string
  date: string
  topics: string[]
  totalPapers: number
  summary: string
  emailSent: boolean
  recipientEmail: string
  workflowStatus?: string
  agentResponses?: {
    arxiv_agent?: { status?: string; papers_found?: number }
    email_agent?: { status?: string; email_delivered?: boolean }
  }
}

interface TopicPapers {
  topic_name: string
  papers: {
    title: string
    authors: string
    abstract: string
    published_date: string
    arxiv_url: string
    relevance_score: number
  }[]
}

// ---------------------------------------------------------------------------
// Sample Data
// ---------------------------------------------------------------------------

const SAMPLE_TOPICS = ['Large Language Models', 'Reinforcement Learning', 'Computer Vision', 'Graph Neural Networks']

const SAMPLE_DIGEST: DigestEntry = {
  id: 'sample-1',
  date: new Date().toISOString(),
  topics: ['Large Language Models', 'Reinforcement Learning'],
  totalPapers: 24,
  summary: 'This week\'s digest covers 24 papers across 2 research topics. Key highlights include new advances in efficient transformer architectures, novel RLHF approaches for alignment, and breakthrough results in multi-modal reasoning. Several papers from top conferences (NeurIPS, ICML) were identified with high relevance scores.',
  emailSent: true,
  recipientEmail: 'researcher@university.edu',
  workflowStatus: 'completed',
  agentResponses: {
    arxiv_agent: { status: 'completed', papers_found: 24 },
    email_agent: { status: 'completed', email_delivered: true },
  },
}

const SAMPLE_DIGESTS: DigestEntry[] = [
  SAMPLE_DIGEST,
  {
    id: 'sample-2',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    topics: ['Computer Vision', 'Graph Neural Networks'],
    totalPapers: 18,
    summary: 'Weekly digest covering 18 papers on computer vision and GNN research. Notable findings include improved self-supervised learning techniques, new graph attention mechanisms, and state-of-the-art results on ImageNet benchmarks.',
    emailSent: true,
    recipientEmail: 'researcher@university.edu',
    workflowStatus: 'completed',
    agentResponses: {
      arxiv_agent: { status: 'completed', papers_found: 18 },
      email_agent: { status: 'completed', email_delivered: true },
    },
  },
  {
    id: 'sample-3',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    topics: ['Large Language Models', 'Computer Vision', 'Reinforcement Learning'],
    totalPapers: 31,
    summary: 'Comprehensive digest with 31 papers across 3 topics. Highlights include chain-of-thought prompting improvements, vision-language model advances, and novel policy gradient methods for continuous control tasks.',
    emailSent: true,
    recipientEmail: 'researcher@university.edu',
    workflowStatus: 'completed',
    agentResponses: {
      arxiv_agent: { status: 'completed', papers_found: 31 },
      email_agent: { status: 'completed', email_delivered: true },
    },
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseResult(result: any): any {
  if (result?.response?.result && typeof result.response.result === 'object') {
    return result.response.result
  }
  const message = result?.response?.message || ''
  if (typeof message === 'string' && message.trim()) {
    try {
      const parsed = JSON.parse(message)
      return parsed?.result || parsed
    } catch {
      return { text: message }
    }
  }
  return { text: extractText(result?.response || {}) || 'No response received' }
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TopicCard({
  topic,
  onEdit,
  onDelete,
}: {
  topic: string
  onEdit: (oldTopic: string, newTopic: string) => void
  onDelete: (topic: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(topic)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="flex items-center justify-between p-3 border border-border bg-card hover:bg-secondary/50 transition-colors">
      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-8 text-sm flex-1"
            autoFocus
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-accent"
            onClick={() => {
              if (editValue.trim()) {
                onEdit(topic, editValue.trim())
                setEditing(false)
              }
            }}
          >
            <FiCheck className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={() => {
              setEditValue(topic)
              setEditing(false)
            }}
          >
            <FiX className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <>
          <span className="font-medium text-sm font-mono">{topic}</span>
          <div className="flex items-center gap-1">
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-destructive mr-1">Delete?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={() => {
                    onDelete(topic)
                    setConfirmDelete(false)
                  }}
                >
                  <FiCheck className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => setConfirmDelete(false)}
                >
                  <FiX className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditing(true)}
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function DigestCard({
  digest,
  defaultExpanded,
}: {
  digest: DigestEntry
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false)
  const dateStr = digest.date ? new Date(digest.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date'

  return (
    <Card className="border-border bg-card">
      <CardHeader
        className="cursor-pointer pb-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiFileText className="w-4 h-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-mono">{dateStr}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {Array.isArray(digest.topics) ? digest.topics.length : 0} topics / {digest.totalPapers ?? 0} papers
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {digest.emailSent ? (
              <Badge variant="default" className="text-xs bg-accent text-accent-foreground">Sent</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Preview</Badge>
            )}
            {expanded ? <FiChevronUp className="w-4 h-4 text-muted-foreground" /> : <FiChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-3">
          <Separator />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-muted-foreground">Status</div>
            <div className="font-mono">{digest.workflowStatus ?? 'N/A'}</div>
            <div className="text-muted-foreground">Recipient</div>
            <div className="font-mono truncate">{digest.recipientEmail ?? 'N/A'}</div>
            {digest.agentResponses?.arxiv_agent && (
              <>
                <div className="text-muted-foreground">ArXiv Agent</div>
                <div className="font-mono">{digest.agentResponses.arxiv_agent.status ?? 'N/A'} ({digest.agentResponses.arxiv_agent.papers_found ?? 0} papers)</div>
              </>
            )}
            {digest.agentResponses?.email_agent && (
              <>
                <div className="text-muted-foreground">Email Agent</div>
                <div className="font-mono">{digest.agentResponses.email_agent.status ?? 'N/A'} ({digest.agentResponses.email_agent.email_delivered ? 'delivered' : 'pending'})</div>
              </>
            )}
          </div>
          {digest.summary && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1">Digest Summary</div>
              <div className="text-sm text-foreground/90 leading-relaxed border border-border p-3 bg-secondary/30">
                {renderMarkdown(digest.summary)}
              </div>
            </div>
          )}
          {Array.isArray(digest.topics) && digest.topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {digest.topics.map((t, i) => (
                <Badge key={i} variant="outline" className="text-xs font-mono">{t}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function AgentStatusPanel({ activeAgentId }: { activeAgentId: string | null }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FiActivity className="w-3.5 h-3.5" />
          Agent Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {AGENTS.map((agent) => (
          <div
            key={agent.id}
            className={cn(
              'flex items-center gap-2 p-2 text-xs border transition-colors',
              activeAgentId === agent.id ? 'border-primary bg-primary/10' : 'border-border'
            )}
          >
            <div className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              activeAgentId === agent.id ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'
            )} />
            <div className="min-w-0 flex-1">
              <div className="font-mono font-medium truncate">{agent.name}</div>
              <div className="text-muted-foreground truncate">{agent.role}</div>
            </div>
            {activeAgentId === agent.id && (
              <FiLoader className="w-3 h-3 text-primary animate-spin flex-shrink-0" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function DashboardSection({
  topics,
  setTopics,
  recipientEmail,
  digestHistory,
  setDigestHistory,
  sampleMode,
  activeAgentId,
  setActiveAgentId,
}: {
  topics: string[]
  setTopics: React.Dispatch<React.SetStateAction<string[]>>
  recipientEmail: string
  digestHistory: DigestEntry[]
  setDigestHistory: React.Dispatch<React.SetStateAction<DigestEntry[]>>
  sampleMode: boolean
  activeAgentId: string | null
  setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [showAddInput, setShowAddInput] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Timer for elapsed time during loading
  useEffect(() => {
    if (!previewLoading) {
      setElapsedSeconds(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [previewLoading])

  // Date range for fetching papers
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)
  const formatDateForInput = (d: Date) => d.toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(formatDateForInput(sevenDaysAgo))
  const [dateTo, setDateTo] = useState(formatDateForInput(today))

  const displayTopics = sampleMode && topics.length === 0 ? SAMPLE_TOPICS : topics

  const handleAddTopic = () => {
    if (newTopic.trim() && !topics.includes(newTopic.trim())) {
      setTopics((prev) => [...prev, newTopic.trim()])
      setNewTopic('')
      setShowAddInput(false)
    }
  }

  const handleEditTopic = (oldTopic: string, newTopicVal: string) => {
    setTopics((prev) => prev.map((t) => (t === oldTopic ? newTopicVal : t)))
  }

  const handleDeleteTopic = (topic: string) => {
    setTopics((prev) => prev.filter((t) => t !== topic))
  }

  const handleGeneratePreview = async () => {
    const topicsToUse = displayTopics
    if (topicsToUse.length === 0) {
      setPreviewError('Add at least one research topic before generating a preview.')
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewData(null)
    setActiveAgentId(MANAGER_AGENT_ID)

    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const message = `Run the weekly research digest pipeline for the following topics: ${topicsToUse.join(', ')}. Send the digest email to: ${recipientEmail || 'preview-only@none.com'}. Today's date is ${todayStr}. Preferred date range: ${dateFrom} to ${dateTo}. Search ArXiv for the most recent papers on each topic, sorted by submission date descending. Prioritize papers from the preferred date range but always return at least 3-5 papers per topic even if they fall outside the range. Never return empty results. Then compose and send a structured digest email with paper summaries, titles with links, and key insights.`
      const result = await callAIAgent(message, MANAGER_AGENT_ID)

      // Check if the call itself failed
      if (!result || !result.success) {
        const errorMsg = result?.error || result?.response?.message || 'Agent call failed. Please try again.'
        setPreviewError(errorMsg)
        setPreviewLoading(false)
        setActiveAgentId(null)
        return
      }

      const data = safeParseResult(result)

      setPreviewData(data)

      const newEntry: DigestEntry = {
        id: generateId(),
        date: data?.processing_timestamp || new Date().toISOString(),
        topics: Array.isArray(data?.topics_processed) ? data.topics_processed : topicsToUse,
        totalPapers: typeof data?.total_papers_found === 'number' ? data.total_papers_found : 0,
        summary: data?.digest_summary || data?.text || '',
        emailSent: data?.email_sent === true,
        recipientEmail: data?.recipient_email || recipientEmail || '',
        workflowStatus: data?.workflow_status || 'completed',
        agentResponses: data?.agent_responses,
      }
      setDigestHistory((prev) => [newEntry, ...prev])
    } catch (err: any) {
      console.error('Generate preview error:', err)
      setPreviewError(err?.message || 'Failed to generate preview. The agent may have timed out. Please try again.')
    } finally {
      setPreviewLoading(false)
      setActiveAgentId(null)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left: Topics */}
      <div className="lg:col-span-3 space-y-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-mono">Research Topics</CardTitle>
                <Badge variant="secondary" className="text-xs font-mono">{displayTopics.length}</Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setShowAddInput(true)}
              >
                <FiPlus className="w-3.5 h-3.5 mr-1" />
                Add Topic
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {showAddInput && (
              <div className="flex items-center gap-2 mb-2">
                <Input
                  placeholder="e.g. Transformer Architectures"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  className="h-8 text-sm flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTopic()
                    if (e.key === 'Escape') {
                      setShowAddInput(false)
                      setNewTopic('')
                    }
                  }}
                />
                <Button size="sm" className="h-8 text-xs" onClick={handleAddTopic}>
                  <FiCheck className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setShowAddInput(false)
                    setNewTopic('')
                  }}
                >
                  <FiX className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            {displayTopics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FiFileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No topics yet</p>
                <p className="text-xs mt-1">Add your first research topic to get started</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[320px]">
                <div className="space-y-1">
                  {displayTopics.map((topic) => (
                    <TopicCard
                      key={topic}
                      topic={topic}
                      onEdit={handleEditTopic}
                      onDelete={handleDeleteTopic}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Preview Results */}
        {previewError && (
          <Alert variant="destructive">
            <FiAlertCircle className="w-4 h-4" />
            <AlertDescription className="text-sm">{previewError}</AlertDescription>
          </Alert>
        )}

        {previewLoading && (
          <Card className="border-primary/30 bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <FiLoader className="w-4 h-4 animate-spin text-primary" />
                  Generating digest preview...
                </CardTitle>
                <Badge variant="outline" className="text-xs font-mono tabular-nums">
                  {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
                </Badge>
              </div>
              <CardDescription className="text-xs mt-1">
                The manager agent is coordinating the ArXiv search and email composition pipeline. This typically takes 1-3 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', elapsedSeconds >= 0 ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40')} />
                  <span className={elapsedSeconds >= 0 ? 'text-foreground' : 'text-muted-foreground'}>Manager agent activated</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', elapsedSeconds >= 5 ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40')} />
                  <span className={elapsedSeconds >= 5 ? 'text-foreground' : 'text-muted-foreground'}>Searching ArXiv for papers...</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', elapsedSeconds >= 30 ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40')} />
                  <span className={elapsedSeconds >= 30 ? 'text-foreground' : 'text-muted-foreground'}>Composing digest email...</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', elapsedSeconds >= 60 ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40')} />
                  <span className={elapsedSeconds >= 60 ? 'text-foreground' : 'text-muted-foreground'}>Finalizing results...</span>
                </div>
              </div>
              <Skeleton className="h-4 w-3/4 mt-3" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        )}

        {previewData && !previewLoading && (
          <Card className="border-primary/30 bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4 text-accent" />
                  Preview Result
                </CardTitle>
                <Badge variant="outline" className="text-xs font-mono">{previewData?.workflow_status ?? 'completed'}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-border p-2 bg-secondary/20">
                  <div className="text-xs text-muted-foreground">Papers Found</div>
                  <div className="text-lg font-mono font-bold text-primary">{previewData?.total_papers_found ?? 0}</div>
                </div>
                <div className="border border-border p-2 bg-secondary/20">
                  <div className="text-xs text-muted-foreground">Topics</div>
                  <div className="text-lg font-mono font-bold">{Array.isArray(previewData?.topics_processed) ? previewData.topics_processed.length : 0}</div>
                </div>
                <div className="border border-border p-2 bg-secondary/20">
                  <div className="text-xs text-muted-foreground">Email Sent</div>
                  <div className="text-lg font-mono font-bold">{previewData?.email_sent ? 'Yes' : 'No'}</div>
                </div>
                <div className="border border-border p-2 bg-secondary/20">
                  <div className="text-xs text-muted-foreground">Recipient</div>
                  <div className="text-sm font-mono truncate">{previewData?.recipient_email ?? 'N/A'}</div>
                </div>
              </div>

              {previewData?.digest_summary && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Digest Summary</div>
                  <div className="border border-border p-3 bg-secondary/20 text-sm leading-relaxed">
                    {renderMarkdown(String(previewData.digest_summary))}
                  </div>
                </div>
              )}

              {previewData?.text && !previewData?.digest_summary && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Response</div>
                  <div className="border border-border p-3 bg-secondary/20 text-sm leading-relaxed">
                    {renderMarkdown(String(previewData.text))}
                  </div>
                </div>
              )}

              {Array.isArray(previewData?.topics_processed) && previewData.topics_processed.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {previewData.topics_processed.map((t: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs font-mono">{t}</Badge>
                  ))}
                </div>
              )}

              {previewData?.agent_responses && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {previewData.agent_responses.arxiv_agent && (
                    <div className="border border-border p-2 bg-secondary/10">
                      <div className="text-xs text-muted-foreground mb-1">ArXiv Agent</div>
                      <div className="text-xs font-mono">Status: {previewData.agent_responses.arxiv_agent.status ?? 'N/A'}</div>
                      <div className="text-xs font-mono">Papers: {previewData.agent_responses.arxiv_agent.papers_found ?? 0}</div>
                    </div>
                  )}
                  {previewData.agent_responses.email_agent && (
                    <div className="border border-border p-2 bg-secondary/10">
                      <div className="text-xs text-muted-foreground mb-1">Email Agent</div>
                      <div className="text-xs font-mono">Status: {previewData.agent_responses.email_agent.status ?? 'N/A'}</div>
                      <div className="text-xs font-mono">Delivered: {previewData.agent_responses.email_agent.email_delivered ? 'Yes' : 'No'}</div>
                    </div>
                  )}
                </div>
              )}

              {previewData?.processing_timestamp && (
                <div className="text-xs text-muted-foreground mt-2">
                  Processed at: <span className="font-mono">{previewData.processing_timestamp}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right: Quick Preview + Stats */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Topics</span>
              <span className="font-mono font-bold">{displayTopics.length}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Next Scheduled Run</span>
              <span className="font-mono text-xs text-primary">Mon 8:00 AM IST</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Digests Generated</span>
              <span className="font-mono font-bold">{digestHistory.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FiCalendar className="w-3.5 h-3.5" />
              Search Date Range
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="date-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <Label htmlFor="date-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
              Papers published within this range will be fetched from ArXiv.
            </p>
          </CardContent>
        </Card>

        <Button
          className="w-full h-12 font-mono text-sm uppercase tracking-wider"
          onClick={handleGeneratePreview}
          disabled={previewLoading}
        >
          {previewLoading ? (
            <>
              <FiLoader className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <FiZap className="w-4 h-4 mr-2" />
              Generate Preview
            </>
          )}
        </Button>

        <AgentStatusPanel activeAgentId={activeAgentId} />
      </div>
    </div>
  )
}

function HistorySection({
  digestHistory,
  sampleMode,
}: {
  digestHistory: DigestEntry[]
  sampleMode: boolean
}) {
  const [filterText, setFilterText] = useState('')
  const displayDigests = sampleMode && digestHistory.length === 0 ? SAMPLE_DIGESTS : digestHistory

  const filtered = displayDigests.filter((d) => {
    if (!filterText.trim()) return true
    const lower = filterText.toLowerCase()
    const topicsMatch = Array.isArray(d.topics) && d.topics.some((t) => t.toLowerCase().includes(lower))
    const summaryMatch = (d.summary ?? '').toLowerCase().includes(lower)
    return topicsMatch || summaryMatch
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter by topic or keyword..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Badge variant="secondary" className="text-xs font-mono">{filtered.length} entries</Badge>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center">
            <FiBookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No digests yet</p>
            <p className="text-xs text-muted-foreground mt-1">Generate your first preview from the Dashboard</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-220px)]">
          <div className="space-y-2">
            {filtered.map((digest, index) => (
              <DigestCard key={digest.id} digest={digest} defaultExpanded={index === 0} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function SettingsSection({
  topics,
  setTopics,
  recipientEmail,
  setRecipientEmail,
}: {
  topics: string[]
  setTopics: React.Dispatch<React.SetStateAction<string[]>>
  recipientEmail: string
  setRecipientEmail: React.Dispatch<React.SetStateAction<string>>
}) {
  const [bulkTopics, setBulkTopics] = useState('')
  const [emailInput, setEmailInput] = useState(recipientEmail)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  useEffect(() => {
    setEmailInput(recipientEmail)
  }, [recipientEmail])

  const handleSave = () => {
    if (emailInput.trim() && !emailRegex.test(emailInput.trim())) {
      setSaveStatus('Invalid email address format')
      return
    }
    setRecipientEmail(emailInput.trim())
    setSaveStatus('Settings saved')
    setTimeout(() => setSaveStatus(null), 3000)
  }

  const handleImport = () => {
    const newTopics = bulkTopics
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !topics.includes(t))
    if (newTopics.length > 0) {
      setTopics((prev) => [...prev, ...newTopics])
      setBulkTopics('')
      setSaveStatus(`Imported ${newTopics.length} topic(s)`)
      setTimeout(() => setSaveStatus(null), 3000)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {saveStatus && (
        <Alert variant={saveStatus.includes('Invalid') ? 'destructive' : 'default'}>
          <AlertDescription className="text-sm">{saveStatus}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <FiMail className="w-4 h-4" />
            Email Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="email" className="text-xs text-muted-foreground">Recipient Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your-email@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="mt-1 h-9 text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">Weekly digest emails will be sent to this address</p>
          </div>
          <Button size="sm" className="text-xs" onClick={handleSave}>
            <FiCheck className="w-3.5 h-3.5 mr-1" />
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <FiClock className="w-4 h-4" />
            Schedule Display
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Schedule</span>
            <span className="font-mono text-primary">{cronToHuman('0 8 * * 1')}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Timezone</span>
            <span className="font-mono">Asia/Kolkata (IST)</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cron Expression</span>
            <Badge variant="outline" className="font-mono text-xs">0 8 * * 1</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2 border-l-2 border-primary/30 pl-2">
            The digest pipeline runs automatically every Monday at 8:00 AM IST. It searches ArXiv for your topics, compiles the results, and sends a digest email.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <FiPlus className="w-4 h-4" />
            Bulk Topic Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="bulk" className="text-xs text-muted-foreground">Topics (comma-separated)</Label>
            <Textarea
              id="bulk"
              placeholder="e.g. Transformer Architectures, Diffusion Models, Federated Learning"
              value={bulkTopics}
              onChange={(e) => setBulkTopics(e.target.value)}
              className="mt-1 text-sm font-mono"
              rows={3}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={handleImport}
            disabled={!bulkTopics.trim()}
          >
            <FiPlus className="w-3.5 h-3.5 mr-1" />
            Import Topics
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ScheduleSection() {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)

  const loadScheduleData = useCallback(async () => {
    setLoading(true)
    try {
      const schedRes = await getSchedule(SCHEDULE_ID)
      if (schedRes.success && schedRes.schedule) {
        setSchedule(schedRes.schedule)
      }
    } catch {
      // silently handle
    }
    setLoading(false)
  }, [])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const logRes = await getScheduleLogs(SCHEDULE_ID, { limit: 10 })
      if (logRes.success) {
        setLogs(logRes.executions)
      }
    } catch {
      // silently handle
    }
    setLogsLoading(false)
  }, [])

  useEffect(() => {
    loadScheduleData()
    loadLogs()
  }, [loadScheduleData, loadLogs])

  const refreshAll = async () => {
    const listRes = await listSchedules()
    if (listRes.success) {
      const found = listRes.schedules.find((s) => s.id === SCHEDULE_ID)
      if (found) setSchedule(found)
    }
    await loadLogs()
  }

  const handleToggle = async () => {
    if (!schedule) return
    setActionLoading(true)
    setActionMsg(null)
    try {
      if (schedule.is_active) {
        const res = await pauseSchedule(SCHEDULE_ID)
        setActionMsg(res.success ? 'Schedule paused' : (res.error ?? 'Failed to pause'))
      } else {
        const res = await resumeSchedule(SCHEDULE_ID)
        setActionMsg(res.success ? 'Schedule resumed' : (res.error ?? 'Failed to resume'))
      }
      await refreshAll()
    } catch {
      setActionMsg('Error toggling schedule')
    }
    setActionLoading(false)
    setTimeout(() => setActionMsg(null), 4000)
  }

  const handleTriggerNow = async () => {
    setActionLoading(true)
    setActionMsg(null)
    try {
      const res = await triggerScheduleNow(SCHEDULE_ID)
      setActionMsg(res.success ? 'Schedule triggered -- execution started' : (res.error ?? 'Failed to trigger'))
      await refreshAll()
    } catch {
      setActionMsg('Error triggering schedule')
    }
    setActionLoading(false)
    setTimeout(() => setActionMsg(null), 5000)
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {actionMsg && (
        <Alert>
          <AlertDescription className="text-sm font-mono">{actionMsg}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <FiClock className="w-4 h-4" />
              Schedule Control
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={refreshAll}
              disabled={actionLoading}
            >
              <FiRefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-border p-3 bg-secondary/10">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <div className="flex items-center gap-2">
                <div className={cn('w-2.5 h-2.5 rounded-full', schedule?.is_active ? 'bg-accent' : 'bg-destructive')} />
                <span className="font-mono text-sm font-bold">{schedule?.is_active ? 'Active' : 'Paused'}</span>
              </div>
            </div>
            <div className="border border-border p-3 bg-secondary/10">
              <div className="text-xs text-muted-foreground mb-1">Schedule</div>
              <div className="font-mono text-sm">{schedule?.cron_expression ? cronToHuman(schedule.cron_expression) : 'Every Monday at 8:00'}</div>
            </div>
            <div className="border border-border p-3 bg-secondary/10">
              <div className="text-xs text-muted-foreground mb-1">Next Run</div>
              <div className="font-mono text-xs">{schedule?.next_run_time ? new Date(schedule.next_run_time).toLocaleString() : 'N/A'}</div>
            </div>
            <div className="border border-border p-3 bg-secondary/10">
              <div className="text-xs text-muted-foreground mb-1">Last Run</div>
              <div className="font-mono text-xs">{schedule?.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : 'Never'}</div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            {schedule?.is_active ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleToggle}
                disabled={actionLoading}
              >
                {actionLoading ? <FiLoader className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FiPause className="w-3.5 h-3.5 mr-1" />}
                Pause Schedule
              </Button>
            ) : (
              <Button
                size="sm"
                className="text-xs"
                onClick={handleToggle}
                disabled={actionLoading}
              >
                {actionLoading ? <FiLoader className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FiPlay className="w-3.5 h-3.5 mr-1" />}
                Resume Schedule
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleTriggerNow}
              disabled={actionLoading}
            >
              {actionLoading ? <FiLoader className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FiZap className="w-3.5 h-3.5 mr-1" />}
              Run Now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <FiActivity className="w-4 h-4" />
              Execution History
            </CardTitle>
            {logsLoading && <FiLoader className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FiClock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No execution logs yet</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-mono">Timestamp</TableHead>
                    <TableHead className="text-xs font-mono">Status</TableHead>
                    <TableHead className="text-xs font-mono">Attempt</TableHead>
                    <TableHead className="text-xs font-mono">Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs font-mono">
                        {log.executed_at ? new Date(log.executed_at).toLocaleString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <Badge variant="default" className="text-xs bg-accent text-accent-foreground">Success</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Failed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{log.attempt}/{log.max_attempts}</TableCell>
                      <TableCell className="text-xs font-mono max-w-[200px] truncate">{log.error_message || 'OK'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: FiGrid },
  { id: 'history', label: 'Digest History', icon: FiBookOpen },
  { id: 'settings', label: 'Settings', icon: FiSettings },
  { id: 'schedule', label: 'Schedule', icon: FiClock },
]

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Page() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [topics, setTopics] = useState<string[]>([])
  const [recipientEmail, setRecipientEmail] = useState('')
  const [digestHistory, setDigestHistory] = useState<DigestEntry[]>([])
  const [sampleMode, setSampleMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true)
    try {
      const savedTopics = localStorage.getItem('arxiv-topics')
      if (savedTopics) {
        const parsed = JSON.parse(savedTopics)
        if (Array.isArray(parsed)) setTopics(parsed)
      }
    } catch { /* ignore */ }
    try {
      const savedEmail = localStorage.getItem('arxiv-email')
      if (savedEmail) setRecipientEmail(savedEmail)
    } catch { /* ignore */ }
    try {
      const savedHistory = localStorage.getItem('arxiv-digest-history')
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory)
        if (Array.isArray(parsed)) setDigestHistory(parsed)
      }
    } catch { /* ignore */ }
  }, [])

  // Save to localStorage on change
  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('arxiv-topics', JSON.stringify(topics))
  }, [topics, mounted])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('arxiv-email', recipientEmail)
  }, [recipientEmail, mounted])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('arxiv-digest-history', JSON.stringify(digestHistory))
  }, [digestHistory, mounted])

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return (
          <DashboardSection
            topics={topics}
            setTopics={setTopics}
            recipientEmail={recipientEmail}
            digestHistory={digestHistory}
            setDigestHistory={setDigestHistory}
            sampleMode={sampleMode}
            activeAgentId={activeAgentId}
            setActiveAgentId={setActiveAgentId}
          />
        )
      case 'history':
        return <HistorySection digestHistory={digestHistory} sampleMode={sampleMode} />
      case 'settings':
        return (
          <SettingsSection
            topics={topics}
            setTopics={setTopics}
            recipientEmail={recipientEmail}
            setRecipientEmail={setRecipientEmail}
          />
        )
      case 'schedule':
        return <ScheduleSection />
      default:
        return null
    }
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans flex">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          'fixed lg:static z-40 top-0 left-0 h-screen w-56 bg-card border-r border-border flex flex-col transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          <div className="p-4 border-b border-border">
            <h1 className="font-mono text-sm font-bold tracking-wider uppercase text-primary">ArXiv Monitor</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Research Digest Pipeline</p>
          </div>

          <nav className="flex-1 p-2 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id)
                    setSidebarOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono transition-colors text-left',
                    activeSection === item.id
                      ? 'bg-primary/15 text-primary border-l-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-l-2 border-transparent'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="p-3 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Sample Data</span>
              <Switch
                checked={sampleMode}
                onCheckedChange={setSampleMode}
              />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Top bar */}
          <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-card/50">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen(true)}
              >
                <FiMenu className="w-5 h-5" />
              </button>
              <h2 className="font-mono text-sm font-medium uppercase tracking-wider">
                {NAV_ITEMS.find((n) => n.id === activeSection)?.label ?? 'Dashboard'}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FiClock className="w-3.5 h-3.5" />
              <span className="font-mono hidden sm:inline">Next: Mon 8:00 AM IST</span>
            </div>
          </header>

          {/* Content area */}
          <div className="p-4 lg:p-6">
            {renderSection()}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}
