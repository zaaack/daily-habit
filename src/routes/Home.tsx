import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectEditor } from '@/components/ProjectEditor'

export function Home() {
  const projects = useAppStore(s => s.projects)
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      {projects.length === 0 ? (
        <div className="card text-center text-slate-500 py-10">
          <div className="text-2xl mb-2">📝</div>
          <div className="text-sm">还没有打卡项目</div>
          <div className="text-xs text-slate-400 mt-1">点击右下角 + 创建一个</div>
        </div>
      ) : (
        projects.map(p => <ProjectCard key={p.id} project={p} />)
      )}

      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-40 h-12 w-12 rounded-full bg-brand-500 text-slate-50 shadow-lg shadow-brand-500/30 grid place-items-center active:scale-95"
        aria-label="新建项目"
      >
        <Plus size={20} />
      </button>
      <ProjectEditor open={open} onOpenChange={setOpen} />
    </div>
  )
}
