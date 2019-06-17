;;; ~/.doom.d/config.el -*- lexical-binding: t; -*-

;; Place your private configuration here
(add-to-list 'default-frame-alist '(fullscreen . maximized))
(setq backup-by-copying t      ; don't clobber symlinks
      backup-directory-alist '(("." . "~/.emacs-saves"))    ; don't litter my fs tree
      delete-old-versions t
      kept-new-versions 6
      kept-old-versions 2
      version-control t)
(setq auto-save-file-name-transforms `((".*" "~/.emacs-saves/" t)))

(after! org
  (setq org-directory (expand-file-name "~/Dropbox/orgmode/")
        org-agenda-files (list org-directory)
        org-ellipsis " ▼ "
        org-agenda-custom-commands
        '(("n" "Agenda and undated TODOs"
            ((agenda "" nil)
             (alltodo "" ((org-agenda-overriding-header "Undated TODO")
                          (org-agenda-skip-function '(org-agenda-skip-entry-if 'schedule 'deadline 'timestamp)))))
            nil))))

(provide 'config)
