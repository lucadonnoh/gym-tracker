<script lang="ts">
  import type { Snippet } from 'svelte';

  let { open = false, onclose, children, id }: {
    open: boolean;
    onclose?: () => void;
    children: Snippet;
    id?: string;
  } = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && onclose) {
      onclose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && onclose) {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" {id} onclick={handleBackdropClick}>
    <div class="modal-content">
      {@render children()}
    </div>
  </div>
{/if}
