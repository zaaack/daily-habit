import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="card text-center py-12">
      <div className="text-3xl mb-2">🤔</div>
      <div className="text-sm text-slate-400">页面不存在</div>
      <Link to="/" className="btn-primary mt-4">回到首页</Link>
    </div>
  )
}
