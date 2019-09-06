;;; ~/.doom.d/config.el -*- lexical-binding: t; -*-

;; Place your private configuration here
(after! doom
  (setq
   backup-by-copying t      ; don't clobber symlinks
   backup-directory-alist
   '(("." . "~/.saves/"))    ; don't litter my fs tree
   delete-old-versions t
   kept-new-versions 6
   kept-old-versions 2
   version-control t)       ; use versioned backups
  )

(after! org
  (setq org-directory (expand-file-name "~/Dropbox/orgmode")
        org-agenda-files (list org-directory)
        org-ellipsis  " ▼ "
        org-todo-keywords '((sequence "TODO" "VERIFY" "DONE"))
        org-agenda-window-setup 'current-window
        org-log-done 'time
        org-src-lang-modes
          (quote
           (("arduino" . arduino)
            ("redis" . redis)
            ("php" . php)
            ("C" . c)
            ("C++" . c++)
            ("asymptote" . asy)
            ("bash" . sh)
            ("beamer" . latex)
            ("calc" . fundamental)
            ("cpp" . c++)
            ("ditaa" . artist)
            ("dot" . graphviz-dot)
            ("elisp" . emacs-lisp)
            ("ocaml" . tuareg)
            ("screen" . shell-script)
            ("shell" . sh)
            ("sqlite" . sql)))
          org-agenda-custom-commands
          (quote
           (("n" "Agenda and Undated TODOs"
             ((agenda ""
                      ((org-agenda-skip-function '(org-agenda-skip-entry-if 'todo 'done))))
              (alltodo ""
                       ((org-agenda-todo-ignore-with-date t)
                        (org-agenda-overriding-header "Undated TODOs"))))
             nil))))
  (map! :map org-mode-map
        :localleader
        "m" #'org-time-stamp-inactive)
  (org-babel-do-load-languages 'org-babel-load-languages '((emacs-lisp . nil) (dot . t)))
  (add-hook 'org-babel-after-execute-hook 'org-redisplay-inline-images)
  (add-hook 'org-mode-hook #'turn-off-smartparens-mode)
  )

(defun multi-term-dedicated ()
  "Open dedicated terminal and select it"
  (interactive)
  (multi-term-dedicated-toggle)
  (if (multi-term-dedicated-exist-p)
      (multi-term-dedicated-select)
    )
  )

(map! :leader
      :desc "Dedicated Terminal" "D" #'multi-term-dedicated)

(after! multi-term
  (setq multi-term-program "/bin/zsh")
  )

(after! org-download
  (org-download-enable)
  (setq org-download-screenshot-method "screencapture -i %s"))

(add-to-list 'custom-theme-load-path "~/.doom.d/themes")
(add-to-list 'default-frame-alist '(fullscreen . maximized))

(setq markdown-css-paths (list "/Users/samer.atiani/pandoc.css"))

(load-theme 'distinguished t)

(provide 'config)
;;; config.el ends here
