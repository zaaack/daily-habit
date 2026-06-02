import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/state/useAppStore'
import { CheckinEditor } from '@/components/CheckinEditor'
import type { Checkin, CheckStatus } from '@/db/types'
import { cn } from '@/lib/cn'
import { format } from 'date-fns'

export function History() {
  const projects = useAppStore(s => s.projects)
  const [params, setParams] = useSearchParams()
  const filterProject = params.get('project') ?? ''
  const [statusFilter, setStatusFilter] = useState<'all' | CheckStatus>('all')
  const [keyword, setKeyword] = useState('')
  const [allCheckins, setAllCheckins] = useState<Checkin[]>([])
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
    const t = setInterval(() => { void load() }, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [projects])

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])

  const filtered = allCheckins.filter(c => {
    if (filterProject && c.projectId !== filterProject) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (keyword && !(c.note ?? '').toLowerCase().includes(keyword.toLowerCase())
      && !(projectById.get(c.projectId)?.name ?? '').toLowerCase().includes(keyword.toLowerCase())) {
      return false
    }
    return true
  })

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
      <div className="card space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={filterProject} onChange={e => {
            const v = e.target.value
            if (v) params.set('project', v); else params.delete('project')
            setParams(params, { replace: true })
          }}>
            <option value="">全部项目</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
          <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | CheckStatus)}>
            <option value="all">全部状态</option>
            <option value="success">✅ 完成</option>
            <option value="fail">❌ 失败</option>
          </select>
        </div>
        <input className="input" placeholder="搜索项目名或备注" value={keyword} onChange={e => setKeyword(e.target.value)} />
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div>共 {filtered.length} 条</div>
          <button className="btn-ghost" onClick={exportCSV}>导出 CSV</button>
        </div>
      </div>

      <div className="card divide-y divide-slate-800 p-0">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">没有匹配的记录</div>
        ) : (
          filtered.map(c => {
            const p = projectById.get(c.projectId)
            return (
              <button
                key={`${c.projectId}-${c.date}`}
                onClick={() => setEditor({ open: true, c })}
                className="w-full text-left p-3 flex items-start gap-2 hover:bg-slate-800/30"
              >
                <span className={cn(
                  'h-5 w-5 rounded grid place-items-center text-xs flex-shrink-0 mt-0.5',
                  c.status === 'success' ? 'text-slate-950' : 'text-white',
                )}
                style={c.status === 'success' ? { background: p?.color ?? '#22c55e' } : { background: '#ef4444' }}
                >{c.status === 'success' ? (c.value != null ? c.value : '✓') : '✕'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span>{p?.emoji} {p?.name}</span>
                    <span className="text-slate-500">{c.date}</span>
                  </div>
                  {c.note && <div className="text-xs text-slate-400 mt-0.5 truncate">{c.note}</div>}
                </div>
              </button>
            )
          })
        )}
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
