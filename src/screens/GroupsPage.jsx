import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import GroupsPane from '../components/GroupsPane.jsx'
import Icon from '../components/Icon.jsx'

/**
 * `/groups` (14 Oct 2026, Rahul): what Home's round Groups button opens —
 * the groups you created, the ones you are in, and Find groups. One way to
 * start a group: the + in the top right.
 */
export default function GroupsPage() {
  return (
    <>
      <TopBar
        title="Groups"
        back
        backTo="/home"
        right={
          <Link
            to="/groups/new"
            aria-label="Start a group"
            title="Start a group"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-btn text-white shadow-sm transition-transform active:scale-95"
          >
            <Icon name="plus" size={18} weight={2.2} />
          </Link>
        }
      />
      <GroupsPane />
    </>
  )
}
