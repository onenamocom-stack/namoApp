import { TopBar } from '../components/Chrome.jsx'
import GroupsPane from '../components/GroupsPane.jsx'

/**
 * `/groups` (14 Oct 2026, Rahul): what Home's round Groups button opens —
 * your groups, Find groups and Start a group, on one page.
 */
export default function GroupsPage() {
  return (
    <>
      <TopBar title="Groups" back backTo="/home" />
      <GroupsPane />
    </>
  )
}
