import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { CheckinEditor } from '@/components/CheckinEditor'
import type { Checkin, CheckStatus } from '@/db/types'
import { cn } from '@/lib/cn'
import { format } from 'date-fns'

const PAGE_SIZE = 30

export function History() {
  const { t } = useTranslation()
  const projects = useAppStore(s => s.projects)
  const checkinVersion = useAppStore(s => s.checkinVersion)
  const [params, setParams] = useSearchParams()
  const filterProject = params.get('project') ?? ''
  const [statusFilter, setStatusFilter] = useState<'all' | CheckStatus>('all')
  const [keyword, setKeyword] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [allCheckins, setAllCheckins] = useState<Checkin[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [editor, setEditor] = useState<{ open: boolean; c?: Checkin }>({ open: false })

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { getRepo } = await import('@/db')
      const repo = await getRepo()
      const out: Checkin[] = []
      for (const p of projects) {
        const all = await repo.getCheckins(p.id)
        for (const c of all) out.push({ ...c, projectId: p.id })
      }
      if (alive) setAllCheckins(out.sort((a, b) => b.date.localeCompare(a.date)))
    }
    void load()
    return () => { alive = false }
  }, [projects, checkinVersion])

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])

  const filtered = useMemo(() => allCheckins.filter(c => {
    if (filterProject && c.projectId !== filterProject) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (dateFrom && c.date < dateFrom) return false
    if (dateTo && c.date > dateTo) return false
    if (keyword && !(c.note ?? '').toLowerCase().includes(keyword.toLowerCase())
      && !(projectById.get(c.projectId)?.name ?? '').toLowerCase().includes(keyword.toLowerCase())) {
      return false
    }
    return true
  }), [allCheckins, filterProject, statusFilter, dateFrom, dateTo, keyword, projectById])

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const hasMore = visibleCount < filtered.length

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filterProject, statusFilter, dateFrom, dateTo, keyword])

  const loadMore = useCallback(() => {
    setVisibleCount(n => n + PAGE_SIZE)
  }, [])

  useEffect(() => {
    if (!hasMore) return
    const onScroll = () => {
      const el = sentinelRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.top <= window.innerHeight + 200) loadMore()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hasMore, loadMore])

  function exportCSV() {
    const lines = ['date,project,status,value,note']
    for (const c of filtered) {
      const p = projectById.get(c.projectId)
      const cells = [c.date, p?.name ?? '', c.status, c.value ?? '', c.note ?? ''].map(x => `"${String(x).replace(/"/g, '""')}"`)
      lines.push(cells.join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `history-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={filterProject} onChange={e => {
            const v = e.target.value
            if (v) params.set('project', v); else params.delete('project')
            setParams(params, { replace: true })
          }}>
            <option value="">{t('history.allProjects')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
          <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | CheckStatus)}>
            <option value="all">{t('history.allStatuses')}</option>
            <option value="success">{t('history.done')}</option>
            <option value="fail">{t('history.fail')}</option>
          </select>
        </div>
        <input className="input" placeholder={t('history.searchPlaceholder')} value={keyword} onChange={e => setKeyword(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label mb-1 block">{t('history.dateFrom')}</label>
            <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label mb-1 block">{t('history.dateTo')}</label>
            <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div>{t('history.count', { count: filtered.length })}</div>
          <button className="btn-ghost" onClick={exportCSV}>{t('history.exportCsv')}</button>
        </div>
      </div>

      <div className="card divide-y divide-slate-700/50 p-0">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-10 text-sm">{t('history.noMatches')}</div>
        ) : (
          visible.map(c => {
            const p = projectById.get(c.projectId)
            return (
              <button
                key={`${c.projectId}-${c.date}`}
                onClick={() => setEditor({ open: true, c })}
                className="w-full text-left p-3.5 flex items-start gap-2.5 hover:bg-slate-800/40 transition-colors"
              >
                <span className={cn(
                  'h-6 w-6 rounded-lg grid place-items-center text-xs flex-shrink-0 mt-0.5 font-medium',
                  'text-white',
                )}
                style={c.status === 'success' ? { background: p?.color ?? '#22c55e' } : { background: '#ef4444' }}
                >{c.status === 'success' ? (c.value != null ? c.value : '✓') : '✕'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-100">{p?.emoji} {p?.name}</span>
                    <span className="text-slate-400">{c.date}</span>
                  </div>
                  {c.note && <div className="text-xs text-slate-400 mt-1 truncate">{c.note}</div>}
                </div>
              </button>
            )
          })
        )}
        {hasMore && <div ref={sentinelRef} className="text-center py-3 text-xs text-slate-500">{t('history.loadMore')}</div>}
      </div>

      {editor.c && (
        <CheckinEditor
          key={editor.open ? 'open' : 'closed'}
          open={editor.open}
          onOpenChange={v => setEditor(e => ({ ...e, open: v }))}
          projectId={editor.c.projectId}
          date={editor.c.date}
          initial={editor.c}
          unit={projectById.get(editor.c.projectId)?.unit}
        />
      )}
    </div>
  )
}
