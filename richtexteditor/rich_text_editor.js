(function ()
  {
  function initRichEditor(root)
    {
    const surface = root.querySelector('[data-rich-editor-surface]');
    const source = root.querySelector('[data-rich-editor-source]');
    const feedback = root.querySelector('[data-rich-editor-feedback]');
    const required = root.hasAttribute('data-rich-editor-required');

    if (!surface || !source)
      {
      return;
      }

    function sync()
      {
      source.value = surface.innerHTML.trim();
      const empty = surface.textContent.trim() === '';
      if (feedback)
        {
        feedback.classList.toggle('d-none', !empty);
        }

      return !(required && empty);
      }

    root.querySelectorAll('[data-editor-command]').forEach((button) =>
      {
      button.addEventListener('click', () =>
        {
        const command = button.getAttribute('data-editor-command') || '';
        if (!command)
          {
          return;
          }

        surface.focus();
        document.execCommand(command, false, null);
        sync();
        });
      });

    surface.addEventListener('input', sync);

    const form = root.closest('form');
    if (form)
      {
      form.addEventListener('submit', (event) =>
        {
        if (!sync())
          {
          event.preventDefault();
          event.stopPropagation();
          }
        });
      }

    sync();
    }

  document.addEventListener('DOMContentLoaded', function ()
    {
    document.querySelectorAll('[data-rich-editor]').forEach(initRichEditor);
    });
  })();
